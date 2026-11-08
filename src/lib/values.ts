/**
 * Value parsing. Everything here is pure and deterministic: the same string
 * always produces the same answer, which is what makes the report reproducible.
 */

const CURRENCY_CHARS = /[$€£¥₹]/;
const CURRENCY_CHARS_ALL = /[$€£¥₹]/g;

export interface NumericValue {
  value: number;
  /** True when the raw text carried a symbol, separator, or percent sign. */
  formatted: boolean;
}

/**
 * Parses the shapes spreadsheets actually contain: `1,200`, `$1,450.50`,
 * `(300)` for negatives, `12%`, and plain numbers.
 *
 * Note: percentages are NOT rescaled. `12%` reads as 12, because rescaling
 * silently changes the meaning of every downstream statistic.
 */
export function parseNumeric(raw: string): NumericValue | null {
  let s = raw.trim();
  if (s === '') return null;

  let formatted = false;
  let negative = false;

  if (/^\(.+\)$/.test(s)) {
    negative = true;
    formatted = true;
    s = s.slice(1, -1).trim();
  }

  if (s.endsWith('%')) {
    formatted = true;
    s = s.slice(0, -1).trim();
  }

  // A non-global regex for .test(): a global regex keeps lastIndex between
  // calls and would silently fail on alternating inputs.
  if (CURRENCY_CHARS.test(s)) {
    formatted = true;
    s = s.replace(CURRENCY_CHARS_ALL, '').trim();
  }

  if (s.includes(',')) {
    formatted = true;
    s = s.replace(/,/g, '');
  }

  s = s.replace(/\s/g, '');

  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  return { value: negative ? -Math.abs(n) : n, formatted };
}

export type DateStyle = 'ISO 8601' | 'year-first' | 'day-first' | 'month-first' | 'named month';

export interface ParsedDate {
  time: number;
  style: DateStyle;
  /** True when the day and month are both <= 12, so the order is a guess. */
  ambiguous: boolean;
  normalized: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/** UTC timestamp with a round-trip check, so 31 February is rejected. */
function utc(year: number, month: number, day: number, hour = 0, minute = 0): number | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  const time = Date.UTC(year, month - 1, day, hour, minute);
  const d = new Date(time);
  const ok =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
  return ok ? time : null;
}

function isoDate(time: number): string {
  const d = new Date(time);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

function make(time: number | null, style: DateStyle, ambiguous: boolean): ParsedDate | null {
  if (time === null) return null;
  return { time, style, ambiguous, normalized: isoDate(time) };
}

export function parseDate(raw: string): ParsedDate | null {
  const s = raw.trim();
  if (s.length < 6) return null;

  // 2026-11-08, 2026-11-08T10:23, 2026-11-08 10:23:41Z
  let m =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(
      s,
    );
  if (m) {
    return make(utc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)), 'ISO 8601', false);
  }

  // 2026/11/08, 2026.11.08
  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (m) {
    return make(utc(+m[1], +m[2], +m[3]), 'year-first', false);
  }

  // 08/11/2026, 8-11-26, 08.11.2026
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const year = normalizeYear(+m[3]);

    if (a > 12 && b <= 12) return make(utc(year, b, a), 'day-first', false);
    if (b > 12 && a <= 12) return make(utc(year, a, b), 'month-first', false);
    if (a <= 12 && b <= 12) return make(utc(year, b, a), 'day-first', true);
    return null;
  }

  // 8 Nov 2026, 8-Nov-26
  m = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTH_NAMES[m[2].toLowerCase()];
    if (month === undefined) return null;
    return make(utc(normalizeYear(+m[3]), month, +m[1]), 'named month', false);
  }

  // Nov 8, 2026, November 8 2026
  m = /^([A-Za-z]{3,9})[ -](\d{1,2}),?[ -](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (month === undefined) return null;
    return make(utc(normalizeYear(+m[3]), month, +m[2]), 'named month', false);
  }

  return null;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', 't']);
const FALSE_WORDS = new Set(['false', 'no', 'n', 'f']);

/** Only the explicit yes/no vocabulary. 0/1 stay numeric, not boolean. */
export function parseBoolean(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

export function isBlank(value: string): boolean {
  return value.trim() === '';
}
