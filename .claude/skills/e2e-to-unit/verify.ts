#!/usr/bin/env bun
/**
 * Verify, without an LLM, that the unit specs on a branch protect what the
 * e2e tests it deleted protected.
 *
 * 1. Scope: the nightly instrumented e2e run says which product functions
 *    each deleted test fired. Functions fired by most tests are boot noise.
 * 2. Execute: one jest run with v8 coverage says which of those functions the
 *    branch's unit specs execute at all.
 * 3. Mutate: every executed function gets a few mutants, compiled into the
 *    file once behind a switch. A generated wrapper spec runs each test once
 *    per mutant, so all mutants share one jest run. Failing pairs run again
 *    with a fresh module registry per mutant to confirm.
 *
 * Output: a Markdown table per deleted test (function, status, detail) and
 * a JSON file with the open rows.
 *
 *   bun .claude/skills/e2e-to-unit/verify.ts [--base master]
 *     [--test "<spec>::<it title>"]... [--unit-spec <path>]...
 *     [--run <nightly run id>] [--boot-threshold 0.2] [--per-function 4]
 *     [--mutate-ceiling 0.1] [--max-mutants 300] [--wrappers 4] [--exclude <path prefix>]...
 *     [--pass-timeout 40] [--no-siblings]
 *     [--scope-only] [--no-confirm] [--out <report.md>] [--json <open-rows.json>]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  type CoverageIndex,
  findTests,
  loadIndex,
  parseKey,
} from "./verify/coverage";
import {
  DEFAULT_PASS_TIMEOUT_MS,
  chunk,
  colocatedSpecs,
  removeWrappers,
  runJest,
  runJestCoverage,
  writeWrappers,
} from "./verify/jest";
import {
  collectPass,
  failingPairs,
  judgeMutant,
  type PassResults,
} from "./verify/judge";
import {
  changedUnitSpecs,
  deletedTests,
  dirtyFiles,
  fileExistsAt,
  lineMapper,
  mergeBase,
  restoreFiles,
} from "./verify/lines";
import {
  type FunctionNode,
  type Mutant,
  type MutantPlan,
  dealMutants,
  functionAtLine,
  mutantsForFunction,
  parseSource,
  splitByShare,
  writeSchemata,
} from "./verify/mutants";
import {
  type FunctionRow,
  type FunctionStatus,
  type TestReport,
  type VerifyReport,
  openRows,
  renderMarkdown,
} from "./verify/report";

interface Options {
  base: string;
  tests: { spec: string; title: string }[];
  unitSpecs: string[];
  runId?: string;
  bootThreshold: number;
  mutateCeiling: number;
  perFunction: number;
  maxMutants: number;
  wrappers: number;
  testTimeoutMs: number;
  passTimeoutMs: number;
  exclude: string[];
  siblings: boolean;
  scopeOnly: boolean;
  confirm: boolean;
  out?: string;
  json?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    base: "origin/master",
    tests: [],
    unitSpecs: [],
    bootThreshold: 0.2,
    mutateCeiling: 0.1,
    perFunction: 4,
    maxMutants: 300,
    wrappers: 8,
    testTimeoutMs: 25000,
    passTimeoutMs: DEFAULT_PASS_TIMEOUT_MS,
    exclude: ["frontend/src/metabase/ui/"],
    siblings: true,
    scopeOnly: false,
    confirm: true,
  };
  const next = (index: number, flag: string) => {
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`${flag} needs a value`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    switch (flag) {
      case "--base":
        options.base = next(index++, flag);
        break;
      case "--test": {
        const [spec, ...title] = next(index++, flag).split("::");
        options.tests.push({ spec, title: title.join("::") });
        break;
      }
      case "--unit-spec":
        options.unitSpecs.push(next(index++, flag));
        break;
      case "--run":
        options.runId = next(index++, flag);
        break;
      case "--boot-threshold":
        options.bootThreshold = Number(next(index++, flag));
        break;
      case "--per-function":
        options.perFunction = Number(next(index++, flag));
        break;
      case "--max-mutants":
        options.maxMutants = Number(next(index++, flag));
        break;
      case "--wrappers":
        options.wrappers = Number(next(index++, flag));
        break;
      case "--test-timeout":
        options.testTimeoutMs = Number(next(index++, flag));
        break;
      case "--exclude":
        options.exclude.push(next(index++, flag));
        break;
      case "--scope-only":
        options.scopeOnly = true;
        break;
      case "--mutate-ceiling":
        options.mutateCeiling = Number(next(index++, flag));
        break;
      case "--pass-timeout":
        options.passTimeoutMs = Number(next(index++, flag)) * 60 * 1000;
        break;
      case "--no-siblings":
        options.siblings = false;
        break;
      case "--no-confirm":
        options.confirm = false;
        break;
      case "--out":
        options.out = next(index++, flag);
        break;
      case "--json":
        options.json = next(index++, flag);
        break;
      default:
        throw new Error(`unknown argument ${flag}`);
    }
  }
  return options;
}

const log = (line: string) => process.stderr.write(`${line}\n`);

function timed<T>(label: string, work: () => T): T {
  const startedAt = Date.now();
  const result = work();
  log(`${label}: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  return result;
}

interface ScopedFunction {
  file: string;
  nightlyLine: number;
  name: string;
  e2eShare: number;
  status: FunctionStatus | "pending";
  detail: string;
  node: FunctionNode | null;
  tests: Set<number>;
  mutants: Mutant[];
}

function scopeFunctions(
  repoRoot: string,
  index: CoverageIndex,
  tests: Options["tests"],
  exclude: string[],
  base: string,
): { functions: ScopedFunction[]; reports: TestReport[] } {
  const functions = new Map<string, ScopedFunction>();
  const reports: TestReport[] = [];
  const sources = new Map<string, ReturnType<typeof parseSource> | null>();
  const mappers = new Map<string, (line: number) => number | null>();

  tests.forEach((test, testIndex) => {
    const records = findTests(index, test.spec, test.title);
    reports.push({
      spec: test.spec,
      title: test.title,
      nightlyRecords: records.length,
      rows: [],
    });
    for (const record of records) {
      for (const id of record.rare) {
        const key = index.keys[id];
        let scoped = functions.get(key);
        if (!scoped) {
          const ref = parseKey(key);
          scoped = {
            file: ref.file,
            nightlyLine: ref.line,
            name: ref.name,
            e2eShare: (index.frequency[id] ?? 0) / index.totalTests,
            status: "pending",
            detail: "",
            node: null,
            tests: new Set(),
            mutants: [],
          };
          functions.set(key, scoped);
        }
        scoped.tests.add(testIndex);
      }
    }
  });

  for (const scoped of functions.values()) {
    if (exclude.some((prefix) => scoped.file.startsWith(prefix))) {
      scoped.status = "excluded";
      continue;
    }
    if (!fileExistsAt(repoRoot, "HEAD", scoped.file)) {
      // A file the nightly instrumented but this branch does not have is only
      // a signal when the branch removed it. When it is missing at the merge
      // base too, master grew it after the branch forked.
      scoped.status = fileExistsAt(repoRoot, base, scoped.file)
        ? "deleted by this branch"
        : "not on this branch";
      continue;
    }
    let mapper = mappers.get(scoped.file);
    if (!mapper) {
      mapper = lineMapper(repoRoot, index.sha, scoped.file);
      mappers.set(scoped.file, mapper);
    }
    const line = mapper(scoped.nightlyLine);
    if (line === null) {
      scoped.status = "changed since nightly";
      continue;
    }
    let source = sources.get(scoped.file);
    if (source === undefined) {
      source = parseSource(
        scoped.file,
        fs.readFileSync(path.join(repoRoot, scoped.file), "utf8"),
      );
      sources.set(scoped.file, source);
    }
    const node = source ? functionAtLine(source, line) : null;
    if (!node) {
      scoped.status = "unmapped";
      scoped.detail = `no function starts at line ${line}`;
      continue;
    }
    scoped.node = node;
  }
  return { functions: [...functions.values()], reports };
}

function markExecution(
  functions: ScopedFunction[],
  executed: Map<string, Set<number>>,
) {
  for (const scoped of functions) {
    if (scoped.status !== "pending" || !scoped.node) {
      continue;
    }
    const lines = executed.get(scoped.file);
    let hit = false;
    for (
      let line = scoped.node.startLine;
      line <= scoped.node.endLine && !hit;
      line++
    ) {
      hit = lines?.has(line) ?? false;
    }
    if (!hit) {
      scoped.status = "not executed";
    }
  }
}

function planMutants(
  repoRoot: string,
  functions: ScopedFunction[],
  options: Options,
) {
  const sources = new Map<string, ReturnType<typeof parseSource>>();
  const rarestFirst = [...functions].sort(
    (a, b) =>
      a.e2eShare - b.e2eShare ||
      a.file.localeCompare(b.file) ||
      a.nightlyLine - b.nightlyLine,
  );

  const { mutate, shared } = splitByShare(
    rarestFirst.filter(
      (scoped) => scoped.status === "pending" && scoped.node !== null,
    ),
    options.mutateCeiling,
  );
  for (const scoped of shared) {
    scoped.status = "shared with other tests";
    scoped.detail = `${(scoped.e2eShare * 100).toFixed(1)}% of e2e tests fire it, at or above --mutate-ceiling`;
  }

  const planned: [ScopedFunction, MutantPlan[]][] = [];
  for (const scoped of mutate) {
    if (!scoped.node) {
      continue;
    }
    let source = sources.get(scoped.file);
    if (!source) {
      source = parseSource(
        scoped.file,
        fs.readFileSync(path.join(repoRoot, scoped.file), "utf8"),
      );
      sources.set(scoped.file, source);
    }
    const plans = source
      ? mutantsForFunction(
          source,
          scoped.file,
          scoped.node,
          scoped.name,
          options.perFunction,
        )
      : [];
    if (plans.length === 0) {
      scoped.status = "no mutant";
      continue;
    }
    planned.push([scoped, plans]);
  }

  const byFile = new Map<string, Mutant[]>();
  for (const [scoped, mutants] of dealMutants(
    planned,
    options.perFunction,
    options.maxMutants,
  )) {
    scoped.mutants = mutants;
    byFile.set(scoped.file, [...(byFile.get(scoped.file) ?? []), ...mutants]);
  }
  for (const [scoped] of planned) {
    if (scoped.mutants.length === 0) {
      scoped.status = "unmeasured";
      scoped.detail = "over --max-mutants";
    }
  }
  return byFile;
}

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function runMutants(
  repoRoot: string,
  byFile: Map<string, Mutant[]>,
  options: Options,
): { fast: PassResults; confirm: PassResults | null } {
  const files = [...byFile.keys()];
  const dirty = dirtyFiles(repoRoot, files);
  if (dirty.length > 0) {
    throw new Error(
      `refusing to mutate files with uncommitted changes:\n${dirty.join("\n")}`,
    );
  }
  const allIds = [...byFile.values()].flat().map((mutant) => mutant.id);
  let wrappers: string[] = [];
  const wrapperSpecs = new Map<string, string>();
  const write = (spec: string, groups: number[][]) => {
    const files = writeWrappers(repoRoot, spec, groups);
    for (const file of files) {
      wrapperSpecs.set(path.join(repoRoot, file), spec);
    }
    return files;
  };
  const cleanup = () => {
    restoreFiles(repoRoot, files);
    removeWrappers(repoRoot, wrappers);
  };
  const onSignal = () => {
    cleanup();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    for (const [file, mutants] of byFile) {
      writeSchemata(repoRoot, file, mutants);
    }
    wrappers = options.unitSpecs.flatMap((spec) =>
      write(spec, chunk(allIds, options.wrappers)),
    );
    const timeout = `--testTimeout=${options.testTimeoutMs}`;
    log(
      `fast pass: ${allIds.length} mutants, ${wrappers.length} wrapper specs`,
    );
    const fast = timed("fast pass", () =>
      collectPass(
        runJest(repoRoot, [...wrappers, timeout], log, options.passTimeoutMs)
          .results,
        wrapperSpecs,
      ),
    );
    removeWrappers(repoRoot, wrappers);
    wrappers = [];
    if (!options.confirm) {
      return { fast: fast.pass, confirm: null };
    }
    const failing = failingPairs(fast);
    if (failing.pairs.size === 0) {
      return { fast: fast.pass, confirm: new Map() };
    }
    wrappers = [...failing.pairs].flatMap(([spec, mutants]) =>
      write(
        spec,
        [...mutants].map((mutant) => [mutant]),
      ),
    );
    const pattern = `(${failing.titles.map(escapeRegex).join("|")})$`;
    log(
      `confirm pass: ${wrappers.length} spec and mutant pairs in their own files across ${failing.pairs.size} specs, ${failing.titles.length} tests`,
    );
    const confirm = timed("confirm pass", () =>
      collectPass(
        runJest(
          repoRoot,
          [...wrappers, timeout, "-t", pattern],
          log,
          options.passTimeoutMs,
        ).results,
        wrapperSpecs,
      ),
    );
    return { fast: fast.pass, confirm: confirm.pass };
  } finally {
    cleanup();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

function judgeFunctions(
  functions: ScopedFunction[],
  fast: PassResults,
  confirm: PassResults | null,
) {
  for (const scoped of functions) {
    if (scoped.status !== "pending") {
      continue;
    }
    const verdicts = scoped.mutants.map((mutant) => ({
      mutant,
      verdict: judgeMutant(mutant.id, fast, confirm),
    }));
    const caught = verdicts.filter(
      ({ verdict }) => verdict.status === "caught",
    );
    const survived = verdicts.filter(
      ({ verdict }) => verdict.status === "survived",
    );
    if (caught.length > 0) {
      scoped.status = "caught";
      const first = caught[0];
      const by = first.verdict.status === "caught" ? first.verdict.by[0] : "";
      scoped.detail = `${caught.length}/${verdicts.length} mutants caught, e.g. ${first.mutant.description} (line ${first.mutant.line}) by \`${by}\``;
    } else if (survived.length > 0) {
      scoped.status = "survived";
      const unmeasured = verdicts.filter(
        ({ verdict }) => verdict.status === "unmeasured",
      );
      const detail = survived
        .map(({ mutant }) => `${mutant.description} (line ${mutant.line})`)
        .join("; ");
      const notMeasured = unmeasured
        .map(
          ({ mutant, verdict }) =>
            `${mutant.description} (line ${mutant.line}): ${
              verdict.status === "unmeasured" ? verdict.reason : ""
            }`,
        )
        .join("; ");
      scoped.detail =
        unmeasured.length > 0
          ? `${detail}. ${unmeasured.length} not measured: ${notMeasured}`
          : detail;
    } else {
      scoped.status = "unmeasured";
      scoped.detail = verdicts
        .map(
          ({ mutant, verdict }) =>
            `${mutant.kind} line ${mutant.line}: ${verdict.status === "unmeasured" ? verdict.reason : verdict.status}`,
        )
        .join("; ");
    }
  }
}

function toReport(
  index: CoverageIndex,
  options: Options,
  functions: ScopedFunction[],
  reports: TestReport[],
  mutantCount: number,
): VerifyReport {
  for (const scoped of functions) {
    const row: FunctionRow = {
      file: scoped.file,
      line: scoped.node?.startLine ?? scoped.nightlyLine,
      name: scoped.name,
      e2eShare: scoped.e2eShare,
      status: scoped.status === "pending" ? "unmeasured" : scoped.status,
      detail: scoped.detail,
    };
    for (const testIndex of scoped.tests) {
      reports[testIndex].rows.push(row);
    }
  }
  return {
    runId: index.runId,
    sha: index.sha,
    unitSpecs: options.unitSpecs,
    mutantCount,
    tests: reports,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  options.base = mergeBase(repoRoot, options.base);

  if (options.tests.length === 0) {
    options.tests = deletedTests(repoRoot, options.base);
  }
  if (options.tests.length === 0) {
    throw new Error(
      `no deleted e2e tests found against ${options.base}; pass --test "<spec>::<title>"`,
    );
  }
  const index = await loadIndex(repoRoot, {
    runId: options.runId,
    bootThreshold: options.bootThreshold,
    log,
  });
  log(
    `nightly run ${index.runId} at ${index.sha.slice(0, 9)}: ${index.totalTests} tests, ${index.boot.length} boot functions dropped`,
  );

  const { functions, reports } = scopeFunctions(
    repoRoot,
    index,
    options.tests,
    options.exclude,
    options.base,
  );
  const pending = functions.filter((scoped) => scoped.status === "pending");
  log(
    `${functions.length} functions in scope, ${pending.length} mapped onto the working tree`,
  );

  if (options.unitSpecs.length === 0) {
    const changed = changedUnitSpecs(repoRoot, options.base);
    const colocated = options.siblings
      ? colocatedSpecs(
          [...new Set(pending.map((scoped) => scoped.file))],
          (file) => fs.existsSync(path.join(repoRoot, file)),
        )
      : [];
    options.unitSpecs = [...new Set([...changed, ...colocated])];
    log(
      `unit specs: ${changed.length} changed by the branch, ${options.unitSpecs.length - changed.length} more colocated with a scoped file`,
    );
  }
  if (options.unitSpecs.length === 0 && !options.scopeOnly) {
    throw new Error(
      `no unit specs found against ${options.base}; pass --unit-spec <path>`,
    );
  }

  let mutantCount = 0;
  if (pending.length > 0 && options.unitSpecs.length > 0) {
    const files = [...new Set(pending.map((scoped) => scoped.file))];
    const executed = timed("coverage pass", () =>
      runJestCoverage(
        repoRoot,
        options.unitSpecs,
        files,
        log,
        options.passTimeoutMs,
      ),
    );
    markExecution(functions, executed);
    const executedCount = functions.filter(
      (scoped) => scoped.status === "pending",
    ).length;
    log(`${executedCount} functions executed by the unit specs`);

    if (!options.scopeOnly && executedCount > 0) {
      const byFile = planMutants(repoRoot, functions, options);
      mutantCount = [...byFile.values()].flat().length;
      if (mutantCount > 0) {
        const { fast, confirm } = runMutants(repoRoot, byFile, options);
        judgeFunctions(functions, fast, confirm);
      }
    }
  }
  for (const scoped of functions) {
    if (scoped.status === "pending") {
      scoped.status = options.scopeOnly ? "unmeasured" : scoped.status;
      scoped.detail = options.scopeOnly
        ? "executed; --scope-only skipped mutants"
        : scoped.detail;
    }
  }

  const report = toReport(index, options, functions, reports, mutantCount);
  const markdown = renderMarkdown(report);
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, markdown);
    log(`report: ${options.out}`);
  } else {
    process.stdout.write(`${markdown}\n`);
  }
  if (options.json) {
    fs.mkdirSync(path.dirname(options.json), { recursive: true });
    fs.writeFileSync(options.json, JSON.stringify(openRows(report), null, 2));
    log(`open rows: ${options.json}`);
  }
}

main().catch((error: unknown) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
