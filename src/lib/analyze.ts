/**
 * The analysis engine. Given CSV text it returns a fully-serialisable report:
 * every column's inferred type, its statistics, and the issues found.
 *
 * Everything here is deterministic, which is what lets the UI promise that the
 * same file always produces the same report.
 */

import { parseCsv } from './csv';
import { formatCompact, formatPercent, plural } from './format';
import { isBlank, parseBoolean, parseDate, parseNumeric } from './values';

export type ColumnKind = 'number' | 'integer' | 'boolean' | 'date' | 'text' | 'empty';
export type Severity = 'high' | 'medium' | 'low';
export type Grade = 'clean' | 'usable' | 'shaky' | 'risky';

export interface Issue {
  severity: Severity;
  title: string;
  detail: string;
  column?: string;
}

export interface HistogramBin {
  label: string;
  count: number;
}

export interface NumberStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  sum: number;
  outliers: number;
  outlierExamples: string[];
  formattedValues: number;
  bins: HistogramBin[];
}

export interface DateStats {
  count: number;
  earliest: string;
  latest: string;
  spanDays: number;
  ambiguous: number;
  styles: string[];
}

export interface Category {
  label: string;
  count: number;
}

export interface ColumnProfile {
  name: string;
  index: number;
  kind: ColumnKind;
  total: number;
  blanks: number;
  unique: number;
  isIdentifier: boolean;
  numbers: NumberStats | null;
  dates: DateStats | null;
  categories: Category[];
  issues: Issue[];
}

export interface Report {
  file: string;
  rows: number;
  columns: number;
  delimiter: string;
  truncated: boolean;
  score: number;
  grade: Grade;
  headers: string[];
  preview: string[][];
  profiles: ColumnProfile[];
  issues: Issue[];
  duplicateRows: number;
}

const MAX_ROWS = 20_000;
const PREVIEW_ROWS = 10;
const MAX_CATEGORIES = 6;
const HISTOGRAM_BINS = 12;
const OUTLIER_MULTIPLIER = 1.5;

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 8, medium: 4, low: 1.5 };
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const KIND_LABELS: Record<ColumnKind, string> = {
  number: 'decimal',
  integer: 'integer',
  boolean: 'yes/no',
  date: 'date',
  text: 'text',
  empty: 'empty',
};

export function kindLabel(kind: ColumnKind): string {
  return KIND_LABELS[kind];
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

interface Scan {
  nonBlank: string[];
  blanks: number;
  padded: number;
  numeric: number;
  numericValues: number[];
  formattedNumbers: number;
  booleans: number;
  dates: number;
  dateTimes: number[];
  dateStyles: Set<string>;
  ambiguousDates: number;
  leadingZeros: string[];
  failedNumeric: string[];
  failedDate: string[];
}

function scanColumn(values: string[]): Scan {
  const scan: Scan = {
    nonBlank: [],
    blanks: 0,
    padded: 0,
    numeric: 0,
    numericValues: [],
    formattedNumbers: 0,
    booleans: 0,
    dates: 0,
    dateTimes: [],
    dateStyles: new Set<string>(),
    ambiguousDates: 0,
    leadingZeros: [],
    failedNumeric: [],
    failedDate: [],
  };

  for (const raw of values) {
    if (isBlank(raw)) {
      scan.blanks += 1;
      continue;
    }

    const value = raw.trim();
    scan.nonBlank.push(value);
    if (value !== raw) scan.padded += 1;
    if (/^0\d+$/.test(value)) scan.leadingZeros.push(value);

    const numeric = parseNumeric(value);
    if (numeric) {
      scan.numeric += 1;
      scan.numericValues.push(numeric.value);
      if (numeric.formatted) scan.formattedNumbers += 1;
    } else if (scan.failedNumeric.length < 3) {
      scan.failedNumeric.push(value);
    }

    if (parseBoolean(value) !== null) scan.booleans += 1;

    const date = parseDate(value);
    if (date) {
      scan.dates += 1;
      scan.dateTimes.push(date.time);
      scan.dateStyles.add(date.style);
      if (date.ambiguous) scan.ambiguousDates += 1;
    } else if (scan.failedDate.length < 3) {
      scan.failedDate.push(value);
    }
  }

  return scan;
}

function chooseKind(scan: Scan): ColumnKind {
  const count = scan.nonBlank.length;
  if (count === 0) return 'empty';
  if (scan.numeric === count) {
    return scan.numericValues.every((value) => Number.isInteger(value)) ? 'integer' : 'number';
  }
  if (scan.booleans === count) return 'boolean';
  if (scan.dates === count) return 'date';
  // A single stray value should not demote a numeric or date column to text,
  // so a clear majority is enough on small files.
  if (scan.numeric / count >= 0.6) return 'number';
  if (scan.dates / count >= 0.6) return 'date';
  return 'text';
}

function histogram(sorted: number[], binCount: number): HistogramBin[] {
  if (sorted.length === 0) return [];

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [{ label: formatCompact(min), count: sorted.length }];

  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, index) => ({
    label: formatCompact(min + index * width),
    count: 0,
  }));

  for (const value of sorted) {
    let index = Math.floor((value - min) / width);
    if (index >= binCount) index = binCount - 1;
    if (index < 0) index = 0;
    bins[index].count += 1;
  }

  return bins;
}

function buildNumberStats(scan: Scan): NumberStats {
  const sorted = [...scan.numericValues].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - OUTLIER_MULTIPLIER * iqr;
  const highFence = q3 + OUTLIER_MULTIPLIER * iqr;
  const outliers = sorted.filter((value) => value < lowFence || value > highFence);

  return {
    count,
    mean: count === 0 ? 0 : sum / count,
    median: quantile(sorted, 0.5),
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
    sum,
    outliers: outliers.length,
    outlierExamples: outliers.slice(0, 3).map(formatCompact),
    formattedValues: scan.formattedNumbers,
    bins: histogram(sorted, HISTOGRAM_BINS),
  };
}

function buildDateStats(scan: Scan): DateStats {
  const times = [...scan.dateTimes].sort((a, b) => a - b);
  const first = times[0] ?? 0;
  const last = times[times.length - 1] ?? 0;

  return {
    count: times.length,
    earliest: new Date(first).toISOString().slice(0, 10),
    latest: new Date(last).toISOString().slice(0, 10),
    spanDays: Math.round((last - first) / 86_400_000),
    ambiguous: scan.ambiguousDates,
    styles: [...scan.dateStyles].sort(),
  };
}

function topCategories(values: string[], limit: number): Category[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    if (isBlank(raw)) continue;
    const key = raw.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  if (sorted.length <= limit) {
    return sorted.map(([label, count]) => ({ label, count }));
  }

  const head = sorted.slice(0, limit - 1).map(([label, count]) => ({ label, count }));
  const rest = sorted.slice(limit - 1);
  const other = rest.reduce((total, [, count]) => total + count, 0);
  return [...head, { label: `other (${rest.length})`, count: other }];
}

function looksLikeIdentifier(name: string): boolean {
  if (/(^|[^A-Za-z])(id|code|key|ref|reference)s?([^A-Za-z]|$)/i.test(name)) return true;
  return /(ID|Id|Code|Key|Ref)$/.test(name.trim());
}

interface ColumnIssueInput {
  name: string;
  kind: ColumnKind;
  total: number;
  blanks: number;
  unique: number;
  nonBlankCount: number;
  scan: Scan;
  numbers: NumberStats | null;
}

function columnIssues(input: ColumnIssueInput): Issue[] {
  const { name, kind, total, blanks, unique, nonBlankCount, scan, numbers } = input;
  const issues: Issue[] = [];

  if (kind === 'empty') {
    issues.push({
      severity: 'medium',
      title: 'Empty column',
      detail: `All ${total} cells are blank, so the column carries no information.`,
      column: name,
    });
    return issues;
  }

  const blankRate = total === 0 ? 0 : blanks / total;
  if (blanks > 0) {
    issues.push({
      severity: blankRate >= 0.5 ? 'high' : blankRate >= 0.1 ? 'medium' : 'low',
      title: blankRate >= 0.5 ? 'Mostly empty' : 'Blank cells',
      detail: `${blanks} of ${total} cells (${formatPercent(blanks, total)}) are blank. Counts and averages quietly shrink around them.`,
      column: name,
    });
  }

  if (kind === 'number' || kind === 'integer' || kind === 'boolean' || kind === 'date') {
    const matched =
      kind === 'date' ? scan.dates : kind === 'boolean' ? scan.booleans : scan.numeric;

    if (matched < nonBlankCount) {
      const mismatched = nonBlankCount - matched;
      const examples =
        kind === 'date'
          ? scan.failedDate
          : kind === 'boolean'
            ? scan.nonBlank.filter((value) => parseBoolean(value) === null).slice(0, 3)
            : scan.failedNumeric;
      const expected = kind === 'date' ? 'dates' : kind === 'boolean' ? 'yes/no values' : 'numbers';

      issues.push({
        severity: mismatched / nonBlankCount >= 0.1 ? 'high' : 'medium',
        title: 'Mixed types',
        detail: `${mismatched} of ${nonBlankCount} values ${mismatched === 1 ? 'is' : 'are'} not ${expected} (${examples
          .map((example) => `"${example}"`)
          .join(', ')}). ${mismatched === 1 ? 'It is' : 'They are'} excluded from the statistics, which skews them.`,
        column: name,
      });
    }
  }

  if (scan.padded > 0) {
    issues.push({
      severity: 'low',
      title: 'Stray spaces',
      detail: `${scan.padded} ${plural(scan.padded, 'value')} ${scan.padded === 1 ? 'has' : 'have'} leading or trailing spaces. Lookups and joins treat " Alice " and "Alice" as different people.`,
      column: name,
    });
  }

  if (scan.leadingZeros.length > 0) {
    const example = scan.leadingZeros[0];
    issues.push({
      severity: kind === 'number' || kind === 'integer' ? 'medium' : 'low',
      title: 'Leading zeros',
      detail:
        kind === 'number' || kind === 'integer'
          ? `Values like "${example}" are read as numbers, so the zeros disappear (${example} becomes ${Number(example)}). Store identifiers as text.`
          : `${scan.leadingZeros.length} ${plural(scan.leadingZeros.length, 'value')} ${scan.leadingZeros.length === 1 ? 'looks' : 'look'} like "${example}". Spreadsheets and numeric parsers strip those zeros, so keep this column as text.`,
      column: name,
    });
  }

  const duplicates = nonBlankCount - unique;
  if (duplicates > 0 && looksLikeIdentifier(name)) {
    issues.push({
      severity: duplicates / nonBlankCount >= 0.1 ? 'high' : 'medium',
      title: 'Duplicate identifiers',
      detail: `${duplicates} ${plural(duplicates, 'value')} ${duplicates === 1 ? 'repeats' : 'repeat'} (${unique} distinct across ${nonBlankCount}). Joining on this column would double-count rows.`,
      column: name,
    });
  }

  if (unique === 1 && nonBlankCount > 0) {
    issues.push({
      severity: 'low',
      title: 'Constant column',
      detail: `Every filled cell holds "${scan.nonBlank[0]}". The column cannot tell any two rows apart.`,
      column: name,
    });
  }

  if (kind === 'text' && nonBlankCount >= 20 && unique / nonBlankCount > 0.9) {
    issues.push({
      severity: 'low',
      title: 'High-cardinality text',
      detail: `${unique} distinct values across ${nonBlankCount} rows. Grouping by this column produces one row per record.`,
      column: name,
    });
  }

  if (numbers && numbers.outliers > 0) {
    issues.push({
      severity: 'medium',
      title: 'Outliers',
      detail: `${numbers.outliers} ${plural(numbers.outliers, 'value')} ${numbers.outliers === 1 ? 'sits' : 'sit'} outside 1.5× the interquartile range (${numbers.outlierExamples.join(', ')}). Check whether they are real or typos before averaging.`,
      column: name,
    });
  }

  if (numbers && numbers.formattedValues > 0 && numbers.formattedValues < numbers.count) {
    issues.push({
      severity: 'low',
      title: 'Mixed number formats',
      detail: `${numbers.formattedValues} of ${numbers.count} values ${numbers.formattedValues === 1 ? 'carries' : 'carry'} a currency symbol, separator or percent sign. They parse, but the source is inconsistent.`,
      column: name,
    });
  }

  if (kind === 'date' && scan.ambiguousDates > 0) {
    issues.push({
      severity: 'high',
      title: 'Ambiguous dates',
      detail: `${scan.ambiguousDates} ${plural(scan.ambiguousDates, 'date')} could be day-first or month-first — "08/11/2026" is 8 November in India and 11 August in the US. This report assumed day-first.`,
      column: name,
    });
  }

  if (kind === 'date' && scan.dateStyles.size > 1) {
    issues.push({
      severity: 'medium',
      title: 'Inconsistent date formats',
      detail: `Found ${scan.dateStyles.size} different formats (${[...scan.dateStyles].join(
        ', ',
      )}). Sorting and filtering will misbehave across them.`,
      column: name,
    });
  }

  return issues;
}

function profileColumn(name: string, index: number, rows: string[][]): ColumnProfile {
  const values = rows.map((row) => row[index] ?? '');
  const scan = scanColumn(values);
  const kind = chooseKind(scan);
  const unique = new Set(scan.nonBlank).size;

  const numbers = kind === 'number' || kind === 'integer' ? buildNumberStats(scan) : null;
  const dates = kind === 'date' ? buildDateStats(scan) : null;
  const categories =
    kind === 'number' || kind === 'integer' || kind === 'date' || kind === 'empty'
      ? []
      : topCategories(values, MAX_CATEGORIES);

  const issues = columnIssues({
    name,
    kind,
    total: values.length,
    blanks: scan.blanks,
    unique,
    nonBlankCount: scan.nonBlank.length,
    scan,
    numbers,
  });

  return {
    name,
    index,
    kind,
    total: values.length,
    blanks: scan.blanks,
    unique,
    isIdentifier: looksLikeIdentifier(name),
    numbers,
    dates,
    categories,
    issues,
  };
}

function countDuplicateRows(rows: string[][]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const key = row.map((cell) => cell.trim()).join('\u0001');
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function tableIssues(
  warnings: string[],
  rows: number,
  duplicateRows: number,
  truncated: boolean,
): Issue[] {
  const issues: Issue[] = [];

  for (const warning of warnings) {
    if (/more than once/i.test(warning)) {
      issues.push({ severity: 'high', title: 'Duplicate column names', detail: warning });
    } else if (/no header name/i.test(warning)) {
      issues.push({ severity: 'medium', title: 'Unnamed columns', detail: warning });
    } else if (/wrong number of fields/i.test(warning)) {
      issues.push({ severity: 'high', title: 'Ragged rows', detail: warning });
    } else if (/ended inside/i.test(warning)) {
      issues.push({ severity: 'high', title: 'Unclosed quote', detail: warning });
    } else {
      issues.push({ severity: 'low', title: 'File structure', detail: warning });
    }
  }

  if (duplicateRows > 0) {
    const rate = rows === 0 ? 0 : duplicateRows / rows;
    issues.push({
      severity: rate >= 0.2 ? 'high' : 'medium',
      title: 'Duplicate rows',
      detail: `${duplicateRows} ${plural(duplicateRows, 'duplicate row')} found (${formatPercent(duplicateRows, rows)} of ${rows}). Every count, total and average is inflated.`,
    });
  }

  if (rows > 0 && rows < 3) {
    issues.push({
      severity: 'low',
      title: 'Very little data',
      detail: `Only ${rows} data ${plural(rows, 'row')}. Statistics from this sample will swing wildly.`,
    });
  }

  if (truncated) {
    issues.push({
      severity: 'low',
      title: 'Large file truncated',
      detail: `Only the first ${MAX_ROWS.toLocaleString('en-US')} rows were analysed to keep the browser responsive.`,
    });
  }

  return issues;
}

function gradeFor(score: number): Grade {
  if (score >= 90) return 'clean';
  if (score >= 70) return 'usable';
  if (score >= 40) return 'shaky';
  return 'risky';
}

export function scoreIssues(issues: Issue[]): number {
  const penalty = issues.reduce((total, issue) => total + SEVERITY_WEIGHT[issue.severity], 0);
  return Math.max(0, Math.round(100 - Math.min(100, penalty)));
}

export function analyzeCsv(text: string, file: string): Report {
  const parsed = parseCsv(text);
  let rows = parsed.rows;
  const truncated = rows.length > MAX_ROWS;
  if (truncated) rows = rows.slice(0, MAX_ROWS);

  const profiles = parsed.headers.map((header, index) => profileColumn(header, index, rows));
  const duplicateRows = countDuplicateRows(rows);

  const issues = [
    ...profiles.flatMap((profile) => profile.issues),
    ...tableIssues(parsed.warnings, rows.length, duplicateRows, truncated),
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const score = scoreIssues(issues);

  return {
    file,
    rows: rows.length,
    columns: parsed.headers.length,
    delimiter: parsed.delimiter,
    truncated,
    score,
    grade: gradeFor(score),
    headers: parsed.headers,
    preview: rows.slice(0, PREVIEW_ROWS),
    profiles,
    issues,
    duplicateRows,
  };
}
