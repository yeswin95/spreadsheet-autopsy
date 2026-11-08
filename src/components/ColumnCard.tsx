import { kindLabel, type ColumnProfile } from '../lib/analyze';
import { formatNumber, formatPercent } from '../lib/format';
import { CategoryBars, Histogram } from './Charts';

interface ColumnCardProps {
  profile: ColumnProfile;
}

export default function ColumnCard({ profile }: ColumnCardProps) {
  const { numbers, dates, categories, issues } = profile;
  const visibleIssues = issues.slice(0, 4);

  // A distribution only earns its space when the column repeats values.
  // One bar per unique name or email address is noise, not a chart.
  const showNumbers = numbers !== null && !profile.isIdentifier;
  const showCategories =
    categories.length > 0 &&
    (profile.unique <= 6 || profile.unique / Math.max(1, profile.total) <= 0.4);

  return (
    <article className="card">
      <header className="card__head">
        <h3 title={profile.name}>{profile.name}</h3>
        <span className={`tag tag--${profile.kind}`}>{kindLabel(profile.kind)}</span>
      </header>

      <dl className="card__stats">
        <div>
          <dt>Filled</dt>
          <dd>{formatNumber(profile.total - profile.blanks)}</dd>
        </div>
        <div>
          <dt>Blank</dt>
          <dd>{formatPercent(profile.blanks, profile.total)}</dd>
        </div>
        <div>
          <dt>Distinct</dt>
          <dd>{formatNumber(profile.unique)}</dd>
        </div>
      </dl>

      {showNumbers && numbers && <Histogram bins={numbers.bins} />}

      {showNumbers && numbers && (
        <p className="card__note">
          median <b>{formatNumber(numbers.median)}</b> · range {formatNumber(numbers.min)}–
          {formatNumber(numbers.max)}
          {numbers.outliers > 0
            ? ` · ${formatNumber(numbers.outliers)} ${numbers.outliers === 1 ? 'outlier' : 'outliers'}`
            : ''}
        </p>
      )}

      {profile.isIdentifier && (
        <p className="card__note">
          Identifier column — a distribution here would say nothing.
        </p>
      )}

      {dates && (
        <p className="card__note">
          {dates.earliest} → {dates.latest} · {formatNumber(dates.spanDays)}-day span
          {dates.ambiguous > 0
            ? ` · ${formatNumber(dates.ambiguous)} ambiguous`
            : ''}
        </p>
      )}

      {showCategories && <CategoryBars items={categories} />}

      {visibleIssues.length > 0 && (
        <ul className="card__issues">
          {visibleIssues.map((issue, index) => (
            <li className={`mini mini--${issue.severity}`} key={`${issue.title}-${index}`}>
              {issue.title}
            </li>
          ))}
          {issues.length > visibleIssues.length && (
            <li className="mini mini--more">
              +{issues.length - visibleIssues.length} more
            </li>
          )}
        </ul>
      )}
    </article>
  );
}
