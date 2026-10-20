export type FunctionStatus =
  | "caught"
  | "survived"
  | "unmeasured"
  | "no mutant"
  | "not executed"
  | "excluded"
  | "changed since nightly"
  | "unmapped"
  | "missing file";

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

export interface VerifyReport {
  runId: string;
  sha: string;
  unitSpecs: string[];
  mutantCount: number;
  tests: TestReport[];
}

export const OPEN_STATUSES: FunctionStatus[] = [
  "survived",
  "unmeasured",
  "not executed",
  "changed since nightly",
  "unmapped",
];

const STATUS_ORDER: FunctionStatus[] = [
  "survived",
  "unmeasured",
  "changed since nightly",
  "unmapped",
  "missing file",
  "no mutant",
  "caught",
  "not executed",
  "excluded",
];

/** Statuses with no per-function detail, shown as one row per file. */
const COLLAPSED: FunctionStatus[] = ["not executed", "excluded"];

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
