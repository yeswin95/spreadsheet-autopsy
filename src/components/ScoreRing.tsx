interface ScoreRingProps {
  score: number;
  grade: string;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toneFor(score: number): string {
  if (score >= 90) return 'good';
  if (score >= 70) return 'ok';
  if (score >= 40) return 'warn';
  return 'bad';
}

export default function ScoreRing({ score, grade }: ScoreRingProps) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className={`score score--${toneFor(score)}`}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Data health score ${score} out of 100`}
      >
        <circle className="score__track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="score__value"
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="score__label">
        <strong>{score}</strong>
        <span>/ 100 · {grade}</span>
      </div>
    </div>
  );
}
