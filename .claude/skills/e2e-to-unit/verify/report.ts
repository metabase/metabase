export type FunctionStatus =
  | "caught"
  | "survived"
  | "unmeasured"
  | "no mutant"
  | "not executed"
  | "excluded"
  | "changed since nightly"
  | "unmapped"
  | "deleted by this branch"
  | "not on this branch";

export interface FunctionRow {
  file: string;
  line: number;
  name: string;
  /** Share of all e2e tests that fire this function; low means specific to the deleted test. */
  e2eShare: number;
  status: FunctionStatus;
  detail: string;
}

export interface TestReport {
  spec: string;
  title: string;
  nightlyRecords: number;
  rows: FunctionRow[];
}

export interface CleanRerunWarning {
  tests: string[];
  /** Mutant verdicts that reported `unmeasured` because of those tests. */
  mutants: number;
}

export interface VerifyReport {
  runId: string;
  sha: string;
  unitSpecs: string[];
  mutantCount: number;
  cleanRerunWarning?: CleanRerunWarning;
  /** A jest pass hit --pass-timeout, so the rows are only what finished. */
  passTimedOut?: boolean;
  tests: TestReport[];
}

export const OPEN_STATUSES: FunctionStatus[] = [
  "survived",
  "unmeasured",
  "not executed",
  "changed since nightly",
  "unmapped",
  "deleted by this branch",
];

const STATUS_ORDER: FunctionStatus[] = [
  "survived",
  "unmeasured",
  "changed since nightly",
  "unmapped",
  "deleted by this branch",
  "no mutant",
  "caught",
  "not executed",
  "not on this branch",
  "excluded",
];

/** Statuses with no per-function detail, shown as one row per file. */
const COLLAPSED: FunctionStatus[] = [
  "not executed",
  "not on this branch",
  "excluded",
];

function countBy(rows: FunctionRow[]) {
  const counts = new Map<FunctionStatus, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return STATUS_ORDER.filter((status) => counts.has(status)).map(
    (status) => `${status} ${counts.get(status)}`,
  );
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
const share = (value: number) => `${(value * 100).toFixed(1)}%`;

function orderRows(rows: FunctionRow[]) {
  return [...rows].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      a.e2eShare - b.e2eShare ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

function collapsedRows(rows: FunctionRow[]) {
  const byFile = new Map<string, FunctionRow[]>();
  for (const row of rows) {
    const key = `${row.status}\u0000${row.file}`;
    byFile.set(key, [...(byFile.get(key) ?? []), row]);
  }
  return [...byFile.entries()].map(([key, group]) => {
    const [status, file] = key.split("\u0000");
    const lines = group.map((row) => row.line).sort((a, b) => a - b);
    return `| \`${file}\` | ${status} | ${group.length} function(s) at line ${lines.join(", ")} |`;
  });
}

export function renderMarkdown(report: VerifyReport): string {
  const lines: string[] = [];
  lines.push(`## Verify: coverage-scoped mutants`);
  lines.push("");
  lines.push(
    `Nightly run ${report.runId} at \`${report.sha.slice(0, 9)}\`, ${report.mutantCount} mutants, unit specs: ${report.unitSpecs.map((spec) => `\`${spec}\``).join(", ")}.`,
  );
  lines.push("");
  lines.push(
    "The e2e share column is the fraction of all e2e tests that fire the function. A low share means the function is specific to the deleted test, so an open row there matters most.",
  );
  lines.push("");
  if (report.passTimedOut) {
    lines.push(
      "**A jest pass hit `--pass-timeout` and was killed.** The rows below are the test results that finished first; mutants whose wrapper never ran report as `unmeasured`. Raise `--pass-timeout`, or narrow the run, for the rest.",
    );
    lines.push("");
  }
  const warning = report.cleanRerunWarning;
  if (warning && warning.tests.length > 0) {
    lines.push(
      `**${warning.tests.length} test(s) failed their clean rerun and voided ${warning.mutants} mutant verdict(s).** A test that does not pass twice in one file confirms nothing, so every mutant it alone witnessed reports as \`unmeasured\`. Fix these, then rerun: ${warning.tests
        .map((test) => `\`${cell(test)}\``)
        .join(", ")}.`,
    );
    lines.push("");
  }
  for (const test of report.tests) {
    lines.push(`### ${cell(test.title)}`);
    lines.push("");
    lines.push(
      `\`${test.spec}\`, ${test.nightlyRecords} nightly record(s). ${countBy(test.rows).join(", ")}.`,
    );
    lines.push("");
    if (test.rows.length === 0) {
      continue;
    }
    lines.push("| Function | Status | e2e share | Detail |");
    lines.push("|---|---|---|---|");
    const ordered = orderRows(test.rows);
    for (const row of ordered.filter(
      (row) => !COLLAPSED.includes(row.status),
    )) {
      lines.push(
        `| \`${row.file}:${row.line}\` ${cell(row.name)} | ${row.status} | ${share(row.e2eShare)} | ${cell(row.detail)} |`,
      );
    }
    const collapsed = ordered.filter((row) => COLLAPSED.includes(row.status));
    if (collapsed.length > 0) {
      lines.push("");
      lines.push("| File | Status | Functions |");
      lines.push("|---|---|---|");
      lines.push(...collapsedRows(collapsed));
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function openRows(report: VerifyReport) {
  return report.tests.map((test) => ({
    spec: test.spec,
    title: test.title,
    rows: orderRows(
      test.rows.filter((row) => OPEN_STATUSES.includes(row.status)),
    ),
  }));
}
