import type { Category, HistogramBin } from '../lib/analyze';
import { formatNumber } from '../lib/format';

interface HistogramProps {
  bins: HistogramBin[];
}

export function Histogram({ bins }: HistogramProps) {
  if (bins.length === 0) return null;
  const peak = Math.max(1, ...bins.map((bin) => bin.count));

  return (
    <div className="chart">
      <div className="chart__bars" role="img" aria-label="Distribution of values">
        {bins.map((bin, index) => (
          <div
            key={`${bin.label}-${index}`}
            className="chart__bar"
            style={{ height: `${Math.max(4, (bin.count / peak) * 100)}%` }}
            title={`${bin.label} — ${formatNumber(bin.count)}`}
          />
        ))}
      </div>
      <div className="chart__axis">
        <span>{bins[0].label}</span>
        <span>{bins[bins.length - 1].label}</span>
      </div>
    </div>
  );
}

interface CategoryBarsProps {
  items: Category[];
}

export function CategoryBars({ items }: CategoryBarsProps) {
  if (items.length === 0) return null;
  const peak = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bars__row" key={item.label}>
          <span className="bars__label" title={item.label}>
            {item.label}
          </span>
          <span className="bars__track">
            <span
              className="bars__fill"
              style={{ width: `${Math.max(2, (item.count / peak) * 100)}%` }}
            />
          </span>
          <span className="bars__count">{formatNumber(item.count)}</span>
        </div>
      ))}
    </div>
  );
}
