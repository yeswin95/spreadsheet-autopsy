const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Locale pinned to en-US so the same file always renders the same report. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return plain.format(value);
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1000) return plain.format(value);
  return compact.format(value);
}

export function formatPercent(part: number, whole: number): string {
  if (whole === 0) return '0%';
  const pct = (part / whole) * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function formatDelimiter(delimiter: string): string {
  if (delimiter === '\t') return 'tab';
  if (delimiter === ',') return 'comma';
  if (delimiter === ';') return 'semicolon';
  if (delimiter === '|') return 'pipe';
  return `"${delimiter}"`;
}
