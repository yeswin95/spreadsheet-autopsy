import { describe, expect, it } from 'vitest';
import { analyzeCsv, type ColumnProfile, type Report } from './analyze';

function column(report: Report, name: string): ColumnProfile {
  const found = report.profiles.find((profile) => profile.name === name);
  if (!found) throw new Error(`No column named ${name}`);
  return found;
}

function hasIssue(report: Report, title: string): boolean {
  return report.issues.some((issue) => issue.title === title);
}

describe('analyzeCsv', () => {
  it('infers a type for every column from its values', () => {
    const csv =
      'id,amount,when,active,name\n1,10.5,2026-01-01,yes,Ann\n2,20,2026-01-02,no,Bob\n3,30.25,2026-01-03,yes,Cid';
    const report = analyzeCsv(csv, 'types.csv');

    expect(column(report, 'id').kind).toBe('integer');
    expect(column(report, 'amount').kind).toBe('number');
    expect(column(report, 'when').kind).toBe('date');
    expect(column(report, 'active').kind).toBe('boolean');
    expect(column(report, 'name').kind).toBe('text');
  });

  it('scores a tidy file 100 and reports no issues', () => {
    const csv =
      'id,amount,when,active,name\n1,10.5,2026-01-01,yes,Ann\n2,20,2026-01-02,no,Bob\n3,30.25,2026-01-03,yes,Cid';
    const report = analyzeCsv(csv, 'clean.csv');

    expect(report.issues).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.grade).toBe('clean');
  });

  it('catches a non-numeric value hiding in a numeric column', () => {
    const report = analyzeCsv('amount\n100\n200\nN/A\n150', 'mixed.csv');

    expect(column(report, 'amount').kind).toBe('number');
    expect(hasIssue(report, 'Mixed types')).toBe(true);
  });

  it('counts duplicate rows', () => {
    const report = analyzeCsv('a,b\n1,2\n1,2\n3,4', 'dupes.csv');

    expect(report.duplicateRows).toBe(1);
    expect(hasIssue(report, 'Duplicate rows')).toBe(true);
  });

  it('flags values outside 1.5x the interquartile range', () => {
    const rows = Array.from({ length: 20 }, (_, index) => String(index + 10));
    const report = analyzeCsv(`value\n${rows.join('\n')}\n1000`, 'outliers.csv');

    expect(column(report, 'value').numbers?.outliers).toBe(1);
    expect(hasIssue(report, 'Outliers')).toBe(true);
  });

  it('flags ambiguous day/month dates as a high severity issue', () => {
    const report = analyzeCsv('when\n08/11/2026\n09/11/2026\n11/11/2026', 'dates.csv');
    const issue = report.issues.find((item) => item.title === 'Ambiguous dates');

    expect(issue?.severity).toBe('high');
    expect(report.issues[0].severity).toBe('high');
  });

  it('notices identifiers that would lose their leading zeros', () => {
    const report = analyzeCsv('id\n007\n008\n009', 'ids.csv');

    expect(column(report, 'id').kind).toBe('integer');
    expect(hasIssue(report, 'Leading zeros')).toBe(true);
  });

  it('marks a column whose values are all identical', () => {
    const report = analyzeCsv('channel\nonline\nonline\nonline', 'constant.csv');

    expect(hasIssue(report, 'Constant column')).toBe(true);
  });

  it('marks a column with no values at all', () => {
    const report = analyzeCsv('note,discount\na,\nb,\nc,', 'empty.csv');

    expect(column(report, 'discount').kind).toBe('empty');
    expect(hasIssue(report, 'Empty column')).toBe(true);
  });

  it('counts blanks and reports the percentage', () => {
    const report = analyzeCsv('a,b\n1,x\n2,\n3,\n4,', 'blanks.csv');

    expect(column(report, 'b').blanks).toBe(3);
    expect(hasIssue(report, 'Mostly empty')).toBe(true);
  });
});
