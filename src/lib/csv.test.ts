import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('keeps commas inside quoted fields', () => {
    const result = parseCsv('name,note\n"Acme, Inc.","big, deal"');
    expect(result.rows).toEqual([['Acme, Inc.', 'big, deal']]);
  });

  it('unwraps doubled quotes', () => {
    const result = parseCsv('quote\n"She said ""hi"""');
    expect(result.rows[0][0]).toBe('She said "hi"');
  });

  it('handles a newline inside a quoted field', () => {
    const result = parseCsv('note\n"line one\nline two"');
    expect(result.rows).toEqual([['line one\nline two']]);
  });

  it('handles CRLF endings and a byte-order mark', () => {
    const result = parseCsv('\ufeffa,b\r\n1,2\r\n3,4\r\n');
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('does not invent a row for a trailing newline', () => {
    const result = parseCsv('a\n1\n');
    expect(result.rows).toEqual([['1']]);
  });

  it('pads short rows and reports them', () => {
    const result = parseCsv('a,b,c\n1,2');
    expect(result.rows).toEqual([['1', '2', '']]);
    expect(result.warnings.join(' ')).toMatch(/wrong number of fields/);
  });

  it('suffixes duplicate headers', () => {
    const result = parseCsv('Amount,Amount\n1,2');
    expect(result.headers).toEqual(['Amount', 'Amount (2)']);
    expect(result.warnings.join(' ')).toMatch(/more than once/);
  });

  it('preserves a stray quote inside unquoted text', () => {
    const result = parseCsv('a,b\nHe said "hi",x');
    expect(result.rows[0]).toEqual(['He said "hi"', 'x']);
  });

  it('skips rows that are completely empty', () => {
    const result = parseCsv('a,b\n1,2\n\n3,4');
    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('detects semicolons', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });

  it('detects tabs', () => {
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
  });

  it('falls back to a comma', () => {
    expect(detectDelimiter('a,b\n1,2')).toBe(',');
  });
});
