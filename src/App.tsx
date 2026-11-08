import { useCallback, useEffect, useState } from 'react';
import Dropzone from './components/Dropzone';
import ReportView from './components/ReportView';
import { analyzeCsv, type Report } from './lib/analyze';
import { SAMPLES } from './lib/samples';

const MAX_BYTES = 8 * 1024 * 1024;

const PROMISES = [
  {
    title: 'Nothing is uploaded',
    body: 'The file is parsed inside this tab. No network request carries your data anywhere.',
  },
  {
    title: 'Types inferred, not assumed',
    body: 'Each column is classified from its values — including the ones that do not fit.',
  },
  {
    title: 'Deterministic',
    body: 'Same file, same report, every time. No model, no API key, no account.',
  },
];

export default function App() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyText = useCallback((text: string, name: string) => {
    if (text.trim() === '') {
      setError('That file is empty.');
      return;
    }

    const result = analyzeCsv(text, name);
    if (result.columns === 0 || result.rows === 0) {
      setError('No data rows found. The file needs a header row and at least one row of data.');
      return;
    }

    setError(null);
    setReport(result);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // A shareable link that opens straight into a sample report, e.g.
  // /?sample=messy-sales.csv — handy when pointing a reviewer at the demo.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('sample');
    if (!requested) return;
    const sample = SAMPLES.find((entry) => entry.file === requested);
    if (sample) applyText(sample.text, sample.file);
  }, [applyText]);

  const handleFile = useCallback(    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
          throw new Error('Please choose a .csv, .tsv or .txt file.');
        }
        if (file.size > MAX_BYTES) {
          throw new Error('That file is larger than 8 MB. Trim it and try again.');
        }
        applyText(await file.text(), file.name);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not read that file.');
      } finally {
        setBusy(false);
      }
    },
    [applyText],
  );

  const handleSample = useCallback(
    (file: string) => {
      const sample = SAMPLES.find((entry) => entry.file === file);
      if (!sample) {
        setError('That sample is not bundled.');
        return;
      }
      applyText(sample.text, sample.file);
    },
    [applyText],
  );

  const reset = useCallback(() => {
    setReport(null);
    setError(null);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand__mark" aria-hidden="true" />
          Spreadsheet Autopsy
        </a>
        <span className="topbar__note">runs locally · no upload · no account</span>
      </header>

      <main>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        {report ? (
          <ReportView report={report} onReset={reset} />
        ) : (
          <section className="hero">
            <p className="eyebrow">CSV health check</p>
            <h1>
              Find out what is wrong with your data <em>before</em> you chart it.
            </h1>
            <p className="lede">
              Drop a spreadsheet export and get a plain-English report: blank cells, mixed
              types, duplicate rows, ambiguous dates and outliers — with row counts, not
              vibes.
            </p>

            <Dropzone busy={busy} samples={SAMPLES} onFile={handleFile} onSample={handleSample} />

            <ul className="promises">
              {PROMISES.map((promise) => (
                <li key={promise.title} className="promise">
                  <h2>{promise.title}</h2>
                  <p>{promise.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Runs entirely in your browser. Your file is never uploaded, stored or logged.</p>
        <p className="footer__note">
          Built with AI assistance — the prompts, the bugs and the rejected approaches are
          documented in <code>NOTES.md</code>.
        </p>
      </footer>
    </div>
  );
}
