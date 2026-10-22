import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { MUTANT_GLOBAL } from "./mutants";

/**
 * Runs jest once and reads its JSON output. Wrapper specs register every test
 * of an original spec once per mutant, with the mutant switch set in the test
 * body, so one process and one module load serve all mutants.
 */

export interface TestResult {
  /** Absolute path of the wrapper spec that ran it. */
  file: string;
  fullName: string;
  title: string;
  status: string;
  failureMessages: string[];
}

export interface JestRun {
  success: boolean;
  results: TestResult[];
}

const JEST_BIN = path.join("node_modules", ".bin", "jest");

function parseJestJson(file: string): JestRun {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const results: TestResult[] = [];
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "testResults" in parsed &&
    Array.isArray(parsed.testResults)
  ) {
    for (const suite of parsed.testResults) {
      if (
        typeof suite !== "object" ||
        suite === null ||
        !("assertionResults" in suite) ||
        !Array.isArray(suite.assertionResults)
      ) {
        continue;
      }
      const suiteFile =
        "name" in suite ? String(Reflect.get(suite, "name")) : "";
      for (const assertion of suite.assertionResults) {
        if (typeof assertion !== "object" || assertion === null) {
          continue;
        }
        const field = (name: string) =>
          name in assertion ? Reflect.get(assertion, name) : undefined;
        const failureMessages: unknown = field("failureMessages");
        results.push({
          file: suiteFile,
          fullName: String(field("fullName") ?? ""),
          title: String(field("title") ?? ""),
          status: String(field("status") ?? ""),
          failureMessages: Array.isArray(failureMessages)
            ? failureMessages.map(String)
            : [],
        });
      }
    }
  }
  const success =
    typeof parsed === "object" &&
    parsed !== null &&
    "success" in parsed &&
    parsed.success === true;
  return { success, results };
}

export function runJest(
  repoRoot: string,
  args: string[],
  log: (line: string) => void,
): JestRun {
  const outputFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "e2e-verify-")),
    "jest.json",
  );
  log(`jest ${args.join(" ")}`);
  const result = spawnSync(
    JEST_BIN,
    [...args, "--silent", "--json", `--outputFile=${outputFile}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (!fs.existsSync(outputFile)) {
    // spawnSync leaves stderr null when the process never started, which is
    // what a command line over the system argument limit looks like.
    const detail = result.error
      ? result.error.message
      : (result.stderr ?? "").slice(-2000);
    throw new Error(`jest produced no JSON output\n${detail}`);
  }
  return parseJestJson(outputFile);
}

/**
 * Line coverage per product file from one jest run with the v8 provider.
 */
export function runJestCoverage(
  repoRoot: string,
  specs: string[],
  files: string[],
  log: (line: string) => void,
): Map<string, Set<number>> {
  const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-verify-cov-"));
  runJest(
    repoRoot,
    [
      ...specs,
      "--coverage",
      "--coverageProvider=v8",
      "--coverageReporters=json",
      `--coverageDirectory=${coverageDir}`,
      ...files.map((file) => `--collectCoverageFrom=${file}`),
    ],
    log,
  );
  const executed = new Map<string, Set<number>>();
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(coverageDir, "coverage-final.json"), "utf8"),
  );
  if (typeof parsed !== "object" || parsed === null) {
    return executed;
  }
  for (const [absolute, fileCoverage] of Object.entries(parsed)) {
    executed.set(
      path.relative(repoRoot, absolute),
      executedLines(fileCoverage),
    );
  }
  return executed;
}

interface StatementRange {
  start: { line: number };
  end: { line: number };
}

function isStatementRange(value: unknown): value is StatementRange {
  return (
    typeof value === "object" &&
    value !== null &&
    "start" in value &&
    "end" in value &&
    typeof value.start === "object" &&
    value.start !== null &&
    "line" in value.start &&
    typeof value.start.line === "number" &&
    typeof value.end === "object" &&
    value.end !== null &&
    "line" in value.end &&
    typeof value.end.line === "number"
  );
}

/** Lines of the statements that an istanbul-format file coverage record counts as executed. */
function executedLines(fileCoverage: unknown): Set<number> {
  const lines = new Set<number>();
  if (typeof fileCoverage !== "object" || fileCoverage === null) {
    return lines;
  }
  const counts: unknown = "s" in fileCoverage ? fileCoverage.s : undefined;
  const ranges: unknown =
    "statementMap" in fileCoverage ? fileCoverage.statementMap : undefined;
  if (
    typeof counts !== "object" ||
    counts === null ||
    typeof ranges !== "object" ||
    ranges === null
  ) {
    return lines;
  }
  for (const [id, count] of Object.entries(counts)) {
    const range: unknown = id in ranges ? Reflect.get(ranges, id) : undefined;
    if (count === 0 || !isStatementRange(range)) {
      continue;
    }
    for (let line = range.start.line; line <= range.end.line; line++) {
      lines.add(line);
    }
  }
  return lines;
}

const SPEC_EXTENSIONS = [
  ".unit.spec.tsx",
  ".unit.spec.ts",
  ".unit.spec.jsx",
  ".unit.spec.js",
];

const SPEC_FILE_RE = /\.spec\.[jt]sx?$/;

/**
 * The unit specs that sit next to the product files in scope, by this repo's
 * colocation convention. A scoped function is protected by its own file's
 * spec far more often than by whichever spec the branch happened to change,
 * so a run that reads only the changed specs reports coverage that exists as
 * a gap.
 */
export function colocatedSpecs(
  files: string[],
  exists: (file: string) => boolean,
): string[] {
  const specs = new Set<string>();
  for (const file of files) {
    if (SPEC_FILE_RE.test(file)) {
      continue;
    }
    const base = file.replace(/\.[jt]sx?$/, "");
    for (const extension of SPEC_EXTENSIONS) {
      if (exists(base + extension)) {
        specs.add(base + extension);
        break;
      }
    }
  }
  return [...specs];
}

export const WRAPPER_PREFIX = "__e2e_verify_";

/**
 * A wrapper spec registers every test of the original spec once per mutant
 * id, mutant 0 being the clean run. Each wrapper file gets its own module
 * registry from jest, so one file per mutant is the isolated form.
 */
export function wrapperSource(specBasename: string, mutantIds: number[]) {
  return `/* generated by e2e-to-unit verify; safe to delete */
const MUTANTS = ${JSON.stringify(mutantIds)};
const g = globalThis;
const origIt = g.it;
const run = (m, fn) =>
  async function (...args) {
    ${MUTANT_GLOBAL} = m;
    try {
      return await fn.apply(this, args);
    } finally {
      ${MUTANT_GLOBAL} = 0;
    }
  };
const wrapped = (name, fn, timeout) => {
  for (const m of MUTANTS) {
    origIt("[m" + m + "] " + name, run(m, fn), timeout);
  }
};
wrapped.each = (...table) => (name, fn, timeout) => {
  for (const m of MUTANTS) {
    origIt.each(...table)("[m" + m + "] " + name, run(m, fn), timeout);
  }
};
wrapped.skip = origIt.skip;
wrapped.only = origIt.only;
wrapped.todo = origIt.todo;
g.it = wrapped;
g.test = wrapped;
require("./${specBasename}");
`;
}

export function wrapperPath(spec: string, index: number) {
  const dir = path.dirname(spec);
  const extension =
    spec.endsWith(".tsx") || spec.endsWith(".jsx") ? ".tsx" : ".ts";
  const label = path
    .basename(spec)
    .replace(/\.unit\.spec\.[jt]sx?$/, "")
    .replace(/[^A-Za-z0-9]+/g, "_");
  return path.join(
    dir,
    `${WRAPPER_PREFIX}${label}_${index}.unit.spec${extension}`,
  );
}

/**
 * Deals items round-robin into `parts` groups, so mutants of one file spread
 * over the wrapper files and a slow file does not land in one worker.
 */
export function chunk<T>(items: T[], parts: number): T[][] {
  const count = Math.min(Math.max(1, parts), items.length);
  const chunks: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => chunks[index % count].push(item));
  return chunks;
}

/** Writes one wrapper file per group of mutant ids, each with the clean run 0 first. */
export function writeWrappers(
  repoRoot: string,
  spec: string,
  groups: number[][],
): string[] {
  const basename = path.basename(spec).replace(/\.[jt]sx?$/, "");
  return groups.map((ids, index) => {
    const file = wrapperPath(spec, index);
    fs.writeFileSync(
      path.join(repoRoot, file),
      wrapperSource(basename, [0, ...ids]),
    );
    return file;
  });
}

export function removeWrappers(repoRoot: string, files: string[]) {
  for (const file of files) {
    fs.rmSync(path.join(repoRoot, file), { force: true });
  }
}

const MUTANT_TITLE = /^\[m(\d+)\] /;

export function mutantOf(title: string): number | null {
  const match = title.match(MUTANT_TITLE);
  return match ? Number(match[1]) : null;
}

export function stripMutant(fullName: string) {
  return fullName.replace(/\[m\d+\] /g, "");
}
