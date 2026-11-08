import { describe, expect, it } from 'vitest';
import { parseBoolean, parseDate, parseNumeric } from './values';

describe('parseNumeric', () => {
  it('parses thousands separators', () => {
    expect(parseNumeric('1,200')).toEqual({ value: 1200, formatted: true });
  });

  it('parses currency with decimals', () => {
    expect(parseNumeric('$1,450.50')).toEqual({ value: 1450.5, formatted: true });
  });

  it('reads parentheses as a negative', () => {
    expect(parseNumeric('(300)')).toEqual({ value: -300, formatted: true });
  });

  it('keeps percentages unscaled', () => {
    expect(parseNumeric('12%')).toEqual({ value: 12, formatted: true });
  });

  it('rejects text', () => {
    expect(parseNumeric('N/A')).toBeNull();
    expect(parseNumeric('')).toBeNull();
  });

  it('accepts plain numbers without marking them formatted', () => {
    expect(parseNumeric('980.50')).toEqual({ value: 980.5, formatted: false });
  });

  // Regression: a global regex used with .test() keeps lastIndex between calls,
  // so only every other currency value would have been recognised.
  it('parses consecutive currency values', () => {
    const values = ['$5', '€6', '£7'].map((raw) => parseNumeric(raw)?.value);
    expect(values).toEqual([5, 6, 7]);
  });
});

describe('parseDate', () => {
  it('parses ISO dates', () => {
    const date = parseDate('2026-11-08');
    expect(date?.normalized).toBe('2026-11-08');
    expect(date?.ambiguous).toBe(false);
  });

  it('flags 08/11/2026 as ambiguous', () => {
    const date = parseDate('08/11/2026');
    expect(date?.ambiguous).toBe(true);
    expect(date?.style).toBe('day-first');
  });

  it('reads 13/11/2026 as day-first', () => {
    expect(parseDate('13/11/2026')?.normalized).toBe('2026-11-13');
    expect(parseDate('13/11/2026')?.ambiguous).toBe(false);
  });

  it('reads 11/13/2026 as month-first', () => {
    expect(parseDate('11/13/2026')?.style).toBe('month-first');
    expect(parseDate('11/13/2026')?.normalized).toBe('2026-11-13');
  });

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('parses named months in both orders', () => {
    expect(parseDate('Nov 10, 2026')?.normalized).toBe('2026-11-10');
    expect(parseDate('10 Nov 2026')?.normalized).toBe('2026-11-10');
  });

  it('expands two-digit years', () => {
    expect(parseDate('11/11/26')?.normalized).toBe('2026-11-11');
  });
});

describe('parseBoolean', () => {
  it('accepts common yes/no words', () => {
    expect(parseBoolean('YES')).toBe(true);
    expect(parseBoolean('n')).toBe(false);
  });

  it('leaves numbers alone', () => {
    expect(parseBoolean('1')).toBeNull();
  });
});
