import type { Issue } from '../lib/analyze';

interface FindingsProps {
  issues: Issue[];
}

export default function Findings({ issues }: FindingsProps) {
  if (issues.length === 0) {
    return (
      <p className="empty">
        Nothing to report. Types are consistent, nothing is blank, and no duplicates or
        date traps were found.
      </p>
    );
  }

  return (
    <ol className="findings">
      {issues.map((issue, index) => (
        <li className={`finding finding--${issue.severity}`} key={`${issue.title}-${index}`}>
          <span className="finding__pill">{issue.severity}</span>
          <div className="finding__body">
            <p className="finding__title">
              {issue.column ? <span className="finding__column">{issue.column}</span> : null}
              {issue.title}
            </p>
            <p className="finding__detail">{issue.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
