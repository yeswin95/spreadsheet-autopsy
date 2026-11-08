import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

export interface SampleOption {
  file: string;
  label: string;
}

interface DropzoneProps {
  busy: boolean;
  samples: SampleOption[];
  onFile: (file: File) => void;
  onSample: (file: string) => void;
}

export default function Dropzone({ busy, samples, onFile, onSample }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <section className="dropzone-wrap" aria-busy={busy}>
      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}${busy ? ' dropzone--busy' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Choose or drop a CSV file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKey}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
        <span className="dropzone__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
            <path d="M9 13h6M9 17h4" strokeLinecap="round" />
          </svg>
        </span>
        <p className="dropzone__title">
          {busy ? 'Reading your file…' : 'Drop a CSV here, or click to choose'}
        </p>
        <p className="dropzone__hint">.csv, .tsv or .txt · up to 8 MB · nothing is uploaded</p>
      </div>

      <div className="samples">
        <span className="samples__label">No file handy?</span>
        {samples.map((sample) => (
          <button
            key={sample.file}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => onSample(sample.file)}
          >
            {sample.label}
          </button>
        ))}
      </div>
    </section>
  );
}
