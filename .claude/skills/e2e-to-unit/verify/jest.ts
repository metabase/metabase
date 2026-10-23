import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { MUTANT_GLOBAL, type Mutant } from "./mutants";

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
  /** The pass hit --pass-timeout, so `results` is only what finished. */
  timedOut: boolean;
}

/** Where the progress reporter appends its lines. */
const PROGRESS_ENV = "E2E_VERIFY_PROGRESS";

/** Where the same reporter appends which scoped files each spec loaded. */
const COVERAGE_MAP_ENV = "E2E_VERIFY_COVERAGE_MAP";

/**
 * Jest writes its --json output once, at the end, so a pass that is killed
 * leaves nothing behind. This reporter appends one line per test as each file
 * finishes, which is what a killed pass can still be judged on.
 *
 * On a coverage run it also records which scoped files each spec loaded. Jest
 * merges coverage across the whole run before it reports, but each spec's own
 * `v8Coverage` is on its result, already restricted to --collectCoverageFrom.
 */
const PROGRESS_REPORTER_SOURCE = `const fs = require("node:fs");
module.exports = class ProgressReporter {
  onTestFileResult(_test, result) {
    const progress = process.env.${PROGRESS_ENV};
    if (progress) {
      const lines = result.testResults.map((test) =>
        JSON.stringify({
          file: result.testFilePath,
          fullName: test.fullName,
          title: test.title,
          status: test.status,
          failureMessages: test.failureMessages,
        }),
      );
      if (lines.length > 0) {
        fs.appendFileSync(progress, lines.join("\\n") + "\\n");
      }
    }
    const coverageMap = process.env.${COVERAGE_MAP_ENV};
    if (coverageMap) {
      // A spec that loaded nothing in scope has no v8Coverage at all, and it
      // still needs a line, so the reader can tell it apart from a spec that
      // never ran.
      const entries = Array.isArray(result.v8Coverage) ? result.v8Coverage : [];
      const files = entries
        .map((entry) => (entry.result || {}).url)
        .filter((url) => typeof url === "string" && url !== "");
      fs.appendFileSync(
        coverageMap,
        JSON.stringify({ spec: result.testFilePath, files }) + "\\n",
      );
    }
  }
};
`;

export function parseProgress(file: string): TestResult[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  const results: TestResult[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      const row: unknown = JSON.parse(line);
      if (typeof row !== "object" || row === null) {
        continue;
      }
      const field = (name: string) =>
        name in row ? Reflect.get(row, name) : undefined;
      const failureMessages: unknown = field("failureMessages");
      results.push({
        file: String(field("file") ?? ""),
        fullName: String(field("fullName") ?? ""),
        title: String(field("title") ?? ""),
        status: String(field("status") ?? ""),
        failureMessages: Array.isArray(failureMessages)
          ? failureMessages.map(String)
          : [],
      });
    } catch {
      // A kill can cut the last line in half; the rest of the file still counts.
    }
  }
  return results;
}

const JEST_BIN = path.join("node_modules", ".bin", "jest");

/** Wall clock for one jest pass, so a wedged mutant costs minutes, not a night. */
export const DEFAULT_PASS_TIMEOUT_MS = 40 * 60 * 1000;

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
  return { success, results, timedOut: false };
}

export interface RunOptions {
  timeoutMs?: number;
  /** Judge what finished when the pass is killed, instead of throwing. */
  allowPartial?: boolean;
  /** Collect which scoped files each spec loaded, for a coverage run. */
  coverageMapFile?: string;
}

export function runJest(
  repoRoot: string,
  args: string[],
  log: (line: string) => void,
  {
    timeoutMs = DEFAULT_PASS_TIMEOUT_MS,
    allowPartial = false,
    coverageMapFile,
  }: RunOptions = {},
): JestRun {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-verify-"));
  const outputFile = path.join(workDir, "jest.json");
  const logFile = path.join(workDir, "jest.log");
  const progressFile = path.join(workDir, "progress.ndjson");
  const reporterFile = path.join(workDir, "progress-reporter.cjs");
  fs.writeFileSync(reporterFile, PROGRESS_REPORTER_SOURCE);
  log(`jest ${args.join(" ")}`);
  // A failing mutant prints the rendered DOM, so a pass over a few hundred
  // mutants writes far more than a pipe will hold. Send it to a file and read
  // the tail only when something went wrong.
  const logFd = fs.openSync(logFile, "w");
  let result;
  try {
    result = spawnSync(
      JEST_BIN,
      [
        ...args,
        "--silent",
        "--json",
        `--outputFile=${outputFile}`,
        "--reporters=default",
        `--reporters=${reporterFile}`,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", logFd, logFd],
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        env: {
          ...process.env,
          [PROGRESS_ENV]: progressFile,
          ...(coverageMapFile && { [COVERAGE_MAP_ENV]: coverageMapFile }),
        },
      },
    );
  } finally {
    fs.closeSync(logFd);
  }
  if (!fs.existsSync(outputFile)) {
    const tail = fs.existsSync(logFile)
      ? fs.readFileSync(logFile, "utf8").slice(-2000)
      : "";
    // spawnSync reports a kill through signal, and leaves error set when the
    // process never started, which is what a command line over the system
    // argument limit looks like.
    if (result.signal === "SIGKILL") {
      const minutes = Math.round(timeoutMs / 60000);
      const partial = allowPartial ? parseProgress(progressFile) : [];
      if (partial.length > 0) {
        log(
          `jest was killed after ${minutes} minutes, so a mutant probably wedged a spec. Judging the ${partial.length} test result(s) that finished; raise --pass-timeout or narrow the run for the rest.`,
        );
        return { success: false, results: partial, timedOut: true };
      }
      throw new Error(
        `jest was killed after ${minutes} minutes, so a mutant probably wedged a spec, and no test finished first. Raise --pass-timeout, or narrow the run.\n${tail}`,
      );
    }
    const detail = result.error ? result.error.message : tail;
    throw new Error(`jest produced no JSON output\n${detail}`);
  }
  return parseJestJson(outputFile);
}

/**
 * Line coverage per product file from one jest run with the v8 provider.
 */
export interface CoverageRun {
  /** Scoped file to the lines any spec executed. */
  executed: Map<string, Set<number>>;
  /** Scoped file to the specs that loaded it. */
  specsByFile: Map<string, Set<string>>;
}

export function runJestCoverage(
  repoRoot: string,
  specs: string[],
  files: string[],
  log: (line: string) => void,
  timeoutMs = DEFAULT_PASS_TIMEOUT_MS,
): CoverageRun {
  const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-verify-cov-"));
  const coverageMapFile = path.join(coverageDir, "spec-files.ndjson");
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
    { timeoutMs, coverageMapFile },
  );
  const executed = new Map<string, Set<number>>();
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(coverageDir, "coverage-final.json"), "utf8"),
  );
  if (typeof parsed === "object" && parsed !== null) {
    for (const [absolute, fileCoverage] of Object.entries(parsed)) {
      executed.set(
        path.relative(repoRoot, absolute),
        executedLines(fileCoverage),
      );
    }
  }
  return {
    executed,
    specsByFile: parseCoverageMap(repoRoot, coverageMapFile),
  };
}

/**
 * Inverts the reporter's per-spec lines into scoped file to the specs that
 * loaded it. A mutant sits behind a switch inside its own file, so a spec that
 * never loaded that file cannot tell the mutant from the original.
 */
export function parseCoverageMap(
  repoRoot: string,
  file: string,
): Map<string, Set<string>> {
  const specsByFile = new Map<string, Set<string>>();
  if (!fs.existsSync(file)) {
    return specsByFile;
  }
  const relative = (value: string) =>
    path.isAbsolute(value) ? path.relative(repoRoot, value) : value;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      const row: unknown = JSON.parse(line);
      if (typeof row !== "object" || row === null || !("spec" in row)) {
        continue;
      }
      const spec = relative(String(Reflect.get(row, "spec")));
      const files: unknown = "files" in row ? Reflect.get(row, "files") : [];
      for (const covered of Array.isArray(files) ? files : []) {
        const key = relative(String(covered));
        const specs = specsByFile.get(key) ?? new Set<string>();
        specs.add(spec);
        specsByFile.set(key, specs);
      }
    } catch {
      // A truncated line costs one spec's entry, not the whole map.
    }
  }
  return specsByFile;
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

/**
 * The mutants each unit spec has to run. A mutant is a switched expression
 * inside its own file, so a spec that never loaded that file behaves
 * identically with the mutant on, and running the pair only costs time. The
 * coverage pass already measured which specs loaded which scoped file.
 */
export function pairSpecsWithMutants(
  byFile: Map<string, Mutant[]>,
  specs: string[],
  specsByFile: Map<string, Set<string>>,
  prune: boolean,
): Map<string, number[]> {
  const allIds = [...byFile.values()].flat().map((mutant) => mutant.id);
  const pairs = new Map<string, number[]>();
  for (const spec of specs) {
    if (!prune) {
      pairs.set(spec, allIds);
      continue;
    }
    const ids = [...byFile]
      .filter(([file]) => specsByFile.get(file)?.has(spec))
      .flatMap(([, mutants]) => mutants.map((mutant) => mutant.id));
    if (ids.length > 0) {
      pairs.set(spec, ids);
    }
  }
  return pairs;
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
