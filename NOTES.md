# Build log

This is the working record for Spreadsheet Autopsy: what I asked the AI for, what
it got wrong, what I rejected and why. The submission form asks for the two or
three best examples; this file is where they come from.

Entries are in the order they happened on 2026-11-08.

---

## 1. Rejected: let a model write the findings

**Proposed.** Have an LLM turn each column into a sentence ("revenue looks
seasonal, watch the March dip").

**Why I rejected it.** Three reasons, in order of how much they mattered:

1. The reviewer runs `npm ci && npm run dev`. A model needs an API key, and a
   missing key would mean the app does not start — an automatic fail on the
   "we will try your exact commands" box.
2. Model output is not stable, so the exported JSON and the on-screen report
   could disagree between runs. That makes "what actually works" unverifiable.
3. A model would invent a reason for an outlier. The whole point of this tool is
   to say *what* is wrong and *how many rows* prove it, not to speculate.

**Did instead.** Fixed rules with fixed severities, each finding carrying its own
counts (`src/lib/analyze.ts`). The report is a pure function of the file. This is
also why the score is arithmetic (100 minus 8/4/1.5 per finding) rather than
something fuzzy.

**Cost.** The findings are less fluent than a model's. That is the trade I chose.

---

## 2. Rejected: `line.split(',')`

**Proposed.** The obvious parser: split each line on commas.

**Why I rejected it before writing it.** A quoted comma breaks it. My fixture has
`"Acme, Inc."`, which becomes two columns under `split(',')`; every downstream
statistic then shifts by one column and the report is quietly wrong. The same
line of code also cannot survive a newline inside a quoted field, which real
exports contain.

**Did instead.** A character-by-character state machine that only splits outside
quotes (`src/lib/csv.ts`), handling doubled quotes (`""`), CRLF, a byte-order
mark, and a quote that appears inside unquoted text (kept literally rather than
swallowing the rest of the row).

**How I know.** `src/lib/csv.test.ts` — nine parser tests, including an embedded
newline and the assertion that a trailing newline does not invent an empty row.
The messy fixture is deliberately BOM + CRLF so the demo keeps exercising it.

---

## 3. Bug caught in review: a global regex used with `.test()`

**What the AI wrote.** The currency check was one regex with the `g` flag:

```ts
const CURRENCY = /[$€£¥₹]/g;
if (CURRENCY.test(s)) { ... }
```

**Why it is a bug.** `/g` makes `test()` stateful: `lastIndex` advances after a
match, so the next call starts further along the string. Alternating values would
silently stop being recognised — `$5` parses, `€6` does not, `£7` parses again.
There is no error and no warning; the statistics just lose values.

**Fixed.** A non-global regex for the test, a separate global one for the
replacement (`src/lib/values.ts`), and a regression test that parses three
currency values in a row:

```ts
it('parses consecutive currency values', () => {
  const values = ['$5', '€6', '£7'].map((raw) => parseNumeric(raw)?.value);
  expect(values).toEqual([5, 6, 7]);
});
```

Without that test the bug would have reappeared the next time someone tidied the
constants.

---

## 4. Bug the tests caught: one stray value demoted a column to text

**What happened.** `npm test` failed on a four-row file: `100, 200, N/A, 150`.
The AI's rule required 80% coverage before calling a column numeric; 3/4 is 75%,
so `Amount` became a **text** column — and a text column never gets the
"mixed types" warning, which is exactly the thing the tool exists to report.

**Why the 80% rule was wrong.** It was tuned on large files. On a small file a
single missing value is 25%, so the threshold turns a real numeric column into
text and hides the finding.

**Fixed.** Lowered the structured-type majority to 60% (`chooseKind` in
`src/lib/analyze.ts`), with a comment explaining why. The mismatched value is
still reported as `Mixed types` rather than dropped.

**Proof.** `src/lib/analyze.test.ts` → "catches a non-numeric value hiding in a
numeric column".

---

## 5. Bug the tests caught: my "clean" fixture was not clean

**What happened.** The clean sample scored 96, not 100. The outlier check flagged
a 30-seat plan: with that spread of seat counts the upper IQR fence really does
sit below 30.

**The decision.** I had two options and picked the less convenient one:

- loosen the outlier rule (3×IQR instead of 1.5×) so the fixture passed — rejected,
  because it weakens a real check to flatter a demo;
- change the fixture's seat counts — accepted, because 30 among those values *is*
  an outlier, and a fixture whose name says "clean" should be genuinely clean.

I changed one value (30 → 26) and left the rule alone. The clean fixture now
scores 100 and the messy one still reports its outliers.

**Why this matters.** It is the difference between tuning the test to the code and
tuning the code to the truth.

---

## 6. Rejected: `tsc -b` with project references

The stock Vite template uses `tsc -b` with `tsconfig.app.json` +
`tsconfig.node.json`. That setup marks both projects `composite`, and `composite`
conflicts with the `--noEmit` check I wanted in both `build` and `typecheck`.

**Did instead.** One `tsconfig.json` covering `src`, with `tsc --noEmit` in the
build script. Fewer moving parts, and `npm run build` still fails on a type error
before Vite runs.

---

## 7. Bug: an ES2025 iterator helper in a browser app

**What the AI wrote.** `scan.dateStyles.values().toArray()` to turn a `Set` into
an array.

**Why it is a bug.** `Iterator.prototype.toArray()` is brand new. It is not in the
`ES2022` lib the project targets and is missing in older Safari/Firefox, so this
was a runtime `TypeError` waiting for the one reviewer on an older browser.

**Fixed.** `[...scan.dateStyles]`. Rebuilt with no type error.

---

## 8. Rejected: fetching the sample files over HTTP

**Proposed.** `fetch('/samples/messy-sales.csv')` when the user clicks a sample.

**Why I rejected it.** It adds a second failure mode (404, offline, wrong base
path) to a feature whose only job is to prove the app works. And the tests needed
`node:fs` to read the same files, which dragged Node types into a browser
project.

**Did instead.** Import the fixtures as raw text
(`import messy from '../samples/messy-sales.csv?raw'`) in `src/lib/samples.ts`.
Samples are now instant, offline-safe, and shared by the app and the tests.

**Bonus.** This is what made the shareable `/?sample=messy-sales.csv` link
possible — one URL that opens a populated report, useful in a submission form.

---

## 9. Rejected: a charting library

**Proposed.** Recharts for the distribution charts.

**Why I rejected it.** It is roughly 100 kB gzipped to draw twelve bars. The
charts here are a histogram and a category bar list; both are a flex container
with percentage heights (`src/components/Charts.tsx`). The whole app ships at
about 56 kB gzipped with React included.

**Cost.** No tooltips beyond the native `title`, no zoom, no brushing. Acceptable
for a report you read once.

---

## 10. Decision: pad ragged rows, do not drop them

A row with too few fields is padded with empty strings and one high-severity
finding is raised (`Ragged rows`). Dropping it silently would make the row count
look tidy while removing data, which is the exact failure mode this tool is
supposed to catch. Truncating a too-long row is reported the same way.

---

## 11. Deployment: Vercel over Render

The brief lists both. Render's free tier spins down when idle; the first request
after a quiet period can wait tens of seconds on a blank page. A reviewer who
clicks once and sees nothing concludes the app is broken. Vercel serves a static
build from the edge with no cold start.

---

## 12. The first UI was accurate but not readable

**What the AI produced.** A working report that read like machine output:
`"," separated`, `1 row(s) had the wrong number of fields and were padded`,
`2 outlier(s) sit outside…`. It also drew a histogram for `Order ID` (a flat wall
of twelve bars), and one bar per row for `Name` and `Email`, because every value
was unique.

**Why it is wrong.** Accuracy is not the same as a readable report. The chart for
an identifier column says nothing, and one-bar-per-row charts are noise dressed
as analysis. Twenty findings also pushed the data preview 1,600px down the page.

**Fixed after screenshotting the rendered report** at 1440px wide:

- delimiter written as a word (`comma separated`);
- singular/plural agreed properly everywhere;
- distributions hidden for identifier columns, with a line saying why;
- category charts only when a column repeats values;
- low-severity findings collapsed behind a toggle, so the twelve findings that
  matter come first.

**Proof.** `docs/screenshot.png`, `src/components/ColumnCard.tsx`.

---

## 13. What the AI did not do

- It did not choose the fixtures. I wrote `messy-sales.csv` by hand so that each
  check has at least one row proving it — the duplicate header, the `007`
  identifier, the `N/A` in `Amount`, the ragged row, the quoted newline.
- It did not pick the score weights; 8/4/1.5 is a deliberate ratio, not a
  generated number.
- It did not verify the install. That was done against a clean copy of the
  repository with no `node_modules` and no `dist` (see below).

## Verification

```bash
# clean copy of the repo — no node_modules, no dist — then the README commands
npm ci
npm test
npm run build
```

- Tests: **41 passed** (4 files), including both bundled fixtures.
- Build: type-check clean, `dist/` produced, ~56 kB gzipped JS.
- Manual checks: both fixtures, a file with a quoted newline, a semicolon file,
  an empty file, a file with a header only, and a refresh (report clears).
