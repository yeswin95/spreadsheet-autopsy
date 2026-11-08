/**
 * A small, strict CSV reader.
 *
 * The temptation is `line.split(',')`. That breaks the moment a field contains
 * a quoted comma (`"Acme, Inc."`), a quoted newline, or a doubled quote. Real
 * exports contain all three, so this is a character-by-character state machine
 * instead: it only splits on a delimiter when it is not inside quotes.
 */

export interface ParseResult {
  headers: string[];
  rows: string[][];
  delimiter: string;
  warnings: string[];
}

const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function firstRecordLine(text: string): string {
  const match = /\r\n|\n|\r/.exec(text);
  return match ? text.slice(0, match.index) : text;
}

/**
 * Guesses the delimiter by counting candidates outside quotes on the first
 * line. Handles the common European `;` exports and tab-separated files.
 */
export function detectDelimiter(text: string): string {
  const line = firstRecordLine(stripBom(text));
  let best: string = ',';
  let bestCount = 0;

  for (const candidate of DELIMITER_CANDIDATES) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

export function parseCsv(input: string, forcedDelimiter?: string): ParseResult {
  const text = stripBom(input);
  const delimiter = forcedDelimiter ?? detectDelimiter(text);
  const warnings: string[] = [];

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    record.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // A quote only opens a quoted field at the start of that field, so stray
    // quotes inside unquoted text are preserved instead of swallowing the row.
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }

    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRecord();
      i += 1;
      continue;
    }

    if (ch === '\n') {
      endRecord();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    warnings.push('The file ended inside a quoted field, so the last value may be truncated.');
  }
  if (field.length > 0 || record.length > 0) endRecord();

  // A trailing newline produces one empty record; drop it without dropping
  // genuinely blank lines in the middle (those are padded and reported below).
  while (records.length > 0) {
    const last = records[records.length - 1];
    if (last.length === 1 && last[0].trim() === '') records.pop();
    else break;
  }

  if (records.length === 0) {
    return { headers: [], rows: [], delimiter, warnings: ['The file is empty.'] };
  }

  const rawHeaders = records[0].map((h) => h.trim());
  const seen = new Map<string, number>();
  let blankHeaders = 0;
  let duplicateHeaders = 0;

  const headers = rawHeaders.map((raw, index) => {
    const base = raw === '' ? `column_${index + 1}` : raw;
    if (raw === '') blankHeaders += 1;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count === 2) duplicateHeaders += 1;
    return count === 1 ? base : `${base} (${count})`;
  });

  if (blankHeaders > 0) {
    warnings.push(
      `${blankHeaders} ${blankHeaders === 1 ? 'column' : 'columns'} had no header name; named ${blankHeaders === 1 ? 'it' : 'them'} column_N.`,
    );
  }
  if (duplicateHeaders > 0) {
    warnings.push(
      `${duplicateHeaders} column ${duplicateHeaders === 1 ? 'name appears' : 'names appear'} more than once.`,
    );
  }

  const width = headers.length;
  const rows: string[][] = [];
  let ragged = 0;
  let emptyRows = 0;

  for (const rec of records.slice(1)) {
    if (rec.every((cell) => cell.trim() === '')) {
      emptyRows += 1;
      continue;
    }
    if (rec.length === width) {
      rows.push(rec);
      continue;
    }
    ragged += 1;
    if (rec.length < width) {
      rows.push([...rec, ...Array<string>(width - rec.length).fill('')]);
    } else {
      rows.push(rec.slice(0, width));
    }
  }

  if (ragged > 0) {
    warnings.push(
      `${ragged} ${ragged === 1 ? 'row' : 'rows'} had the wrong number of fields and ${ragged === 1 ? 'was' : 'were'} padded or truncated.`,
    );
  }
  if (emptyRows > 0) {
    warnings.push(
      `${emptyRows} completely empty ${emptyRows === 1 ? 'row was' : 'rows were'} skipped.`,
    );
  }

  return { headers, rows, delimiter, warnings };
}
