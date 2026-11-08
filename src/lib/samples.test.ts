import { describe, expect, it } from 'vitest';
import { analyzeCsv } from './analyze';
import { SAMPLES } from './samples';

function sample(name: string): string {
  const found = SAMPLES.find((entry) => entry.file === name);
  if (!found) throw new Error(`No bundled sample named ${name}`);
  return found.text;
}

describe('bundled samples', () => {
  it('the clean sample scores a perfect 100', () => {
    const report = analyzeCsv(sample('clean-customers.csv'), 'clean-customers.csv');

    expect(report.issues).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.rows).toBe(12);
  });

  it('the messy sample trips every headline check', () => {
    const report = analyzeCsv(sample('messy-sales.csv'), 'messy-sales.csv');
    const titles = new Set(report.issues.map((issue) => issue.title));

    expect(report.score).toBeLessThan(60);
    expect(titles.has('Duplicate column names')).toBe(true);
    expect(titles.has('Ragged rows')).toBe(true);
    expect(titles.has('Ambiguous dates')).toBe(true);
    expect(titles.has('Duplicate rows')).toBe(true);
    expect(titles.has('Leading zeros')).toBe(true);
    expect(titles.has('Empty column')).toBe(true);
    expect(titles.has('Outliers')).toBe(true);
  });

  it('reads a quoted newline as one field rather than two rows', () => {
    const report = analyzeCsv(sample('messy-sales.csv'), 'messy-sales.csv');
    const notes = report.profiles.find((profile) => profile.name === 'Notes');

    expect(notes?.unique).toBeGreaterThan(0);
    expect(report.rows).toBe(17);
  });
});
