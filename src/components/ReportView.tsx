import { useState } from 'react';
import type { Grade, Report, Severity } from '../lib/analyze';
import { downloadText, toJson, toMarkdown } from '../lib/export';
import { formatDelimiter, formatNumber, plural } from '../lib/format';
import ColumnCard from './ColumnCard';
import DataPreview from './DataPreview';
import Findings from './Findings';
import ScoreRing from './ScoreRing';

const GRADE_COPY: Record<Grade, string> = {
  clean: 'Clean enough to trust.',
  usable: 'Usable, with a few things to tidy.',
  shaky: 'Fix the top issues before you analyse this.',
  risky: 'Do not build charts on this yet.',
};

interface ReportViewProps {
  report: Report;
  onReset: () => void;
}

export default function ReportView({ report, onReset }: ReportViewProps) {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of report.issues) counts[issue.severity] += 1;

  const [showLow, setShowLow] = useState(false);
  const visibleIssues = showLow
    ? report.issues
    : report.issues.filter((issue) => issue.severity !== 'low');

  const base = report.file.replace(/\.[^.]+$/, '') || 'report';
  const findingLabel = `${report.issues.length} ${plural(report.issues.length, 'finding')}`;

  return (
    <div className="report">
      <div className="report__top">
        <button type="button" className="ghost" onClick={onReset}>
          ← Analyse another file
        </button>
        <span className="report__file" title={report.file}>
          {report.file}
        </span>
      </div>

      <section className="summary">
        <ScoreRing score={report.score} grade={report.grade} />
        <div className="summary__body">
          <p className="eyebrow">{GRADE_COPY[report.grade]}</p>
          <h2>{report.issues.length === 0 ? 'Nothing to fix' : findingLabel}</h2>
          <p className="summary__meta">
            {formatNumber(report.rows)} rows × {formatNumber(report.columns)} columns ·{' '}
            {formatDelimiter(report.delimiter)} separated
            {report.truncated ? ' · truncated' : ''}
          </p>
          <div className="counts">
            <span className="counts__item counts__item--high">
              <b>{counts.high}</b> high
            </span>
            <span className="counts__item counts__item--medium">
              <b>{counts.medium}</b> medium
            </span>
            <span className="counts__item counts__item--low">
              <b>{counts.low}</b> low
            </span>
          </div>        </div>
        <div className="summary__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => downloadText(`${base}-autopsy.md`, toMarkdown(report), 'text/markdown')}
          >
            Download report (.md)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadText(`${base}-autopsy.json`, toJson(report), 'application/json')}
          >
            Download raw data (.json)
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>What to fix first</h2>
          <p>Ranked by severity. Every claim cites the rows behind it.</p>
        </div>
        {report.issues.length === 0 ? <Findings issues={[]} /> : null}
        {visibleIssues.length > 0 ? <Findings issues={visibleIssues} /> : null}
        {counts.low > 0 ? (
          <button
            type="button"
            className="btn btn--toggle"
            onClick={() => setShowLow((value) => !value)}
          >
            {showLow
              ? 'Hide low-severity findings'
              : `Show ${counts.low} low-severity ${plural(counts.low, 'finding')}`}
          </button>
        ) : null}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>First {report.preview.length} rows</h2>
          <p>Blank cells are shown as ·. This is the raw text, not a reinterpretation.</p>
        </div>
        <DataPreview headers={report.headers} rows={report.preview} />
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Columns</h2>
          <p>Types were inferred from the values, not from the header name.</p>
        </div>
        <div className="grid">
          {report.profiles.map((profile) => (
            <ColumnCard key={`${profile.name}-${profile.index}`} profile={profile} />
          ))}
        </div>
      </section>
    </div>
  );
}
