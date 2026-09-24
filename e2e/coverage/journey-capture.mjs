/**
 * Reads the raw artifacts of .github/workflows/e2e-journey-capture.yml and subtracts baselines offline.
 * The format is described in e2e/journey-capture/README.md.
 *
 *   node e2e/coverage/journey-capture.mjs <run dir> [--subtract] [--baselines <name,...>] [--compare <other run dir>]
 *
 * <run dir> holds one directory per downloaded shard artifact
 * (`gh run download <id> -p 'journey-capture-shard-*' -D <run dir>`),
 * or is a single shard directory.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import jacoco from "./jacoco.js";
import { normalizeRoute } from "./routes.mjs";

export const SCHEMA = "metabase-e2e-journey-capture";
export const SCHEMA_VERSIONS = [1];

const RUNNER_PREFIX = "/home/runner/work/metabase/metabase/";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readDir(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJson(path.join(dir, name)));
}

export function shardDirs(runDir) {
  if (fs.existsSync(path.join(runDir, "meta.json"))) {
    return [runDir];
  }
  return fs
    .readdirSync(runDir)
    .map((name) => path.join(runDir, name))
    .filter((dir) => fs.existsSync(path.join(dir, "meta.json")))
    .sort();
}

export function loadShard(dir) {
  const meta = readJson(path.join(dir, "meta.json"));
  if (meta.schema !== SCHEMA || !SCHEMA_VERSIONS.includes(meta.schemaVersion)) {
    throw new Error(
      `${dir}: unsupported capture ${meta.schema} v${meta.schemaVersion}`,
    );
  }
  const classesFile = path.join(dir, "backend", "classes.jsonl");
  const classes = fs.existsSync(classesFile)
    ? fs
        .readFileSync(classesFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
  const baselineRounds = fs.existsSync(path.join(dir, "baselines"))
    ? fs
        .readdirSync(path.join(dir, "baselines"))
        .filter((name) => name !== "backend")
    : [];
  const variants = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("tests-"))
    .map((name) => [
      name.slice("tests-".length),
      readDir(path.join(dir, name)),
    ]);
  return {
    dir,
    meta,
    classes,
    tests: readDir(path.join(dir, "tests")),
    variants: Object.fromEntries(variants),
    snapshots: readDir(path.join(dir, "snapshots")),
    baselines: baselineRounds.flatMap((round) =>
      readDir(path.join(dir, "baselines", round)),
    ),
    backendBaselines: readDir(path.join(dir, "baselines", "backend")),
  };
}

// One shard at a time, since a whole run doesn't fit comfortably in memory.
export function* iterateRun(runDir) {
  for (const dir of shardDirs(runDir)) {
    yield loadShard(dir);
  }
}

const relative = (file) =>
  file.startsWith(RUNNER_PREFIX) ? file.slice(RUNNER_PREFIX.length) : file;

function firedFunctions(f) {
  const fired = new Set();
  for (const [file, counts] of Object.entries(f ?? {})) {
    for (const [index, count] of Object.entries(counts)) {
      if (count > 0) {
        fired.add(`${relative(file)}#${index}`);
      }
    }
  }
  return fired;
}

function classNames(shard, dump) {
  return new Set((dump?.classes ?? []).map((i) => shard.classes[i]?.[0]));
}

/**
 * Removes from each test's sets whatever any attempt of the chosen baselines fired.
 * Empty lists give the raw sets.
 */
export function subtractBaselines(
  shard,
  {
    frontend = ["coverage-baseline"],
    routes = ["coverage-baseline"],
    backend = ["coverage-baseline", "backend-idle"],
    includeBeforeTest = false,
  } = {},
) {
  const cypressBaselines = (names) =>
    shard.baselines
      .filter((entry) => names.includes(entry.baseline?.name))
      .flatMap((entry) => entry.tests);

  const baselineFunctions = new Set();
  for (const test of cypressBaselines(frontend)) {
    for (const fn of firedFunctions(test.f)) {
      baselineFunctions.add(fn);
    }
  }
  const baselineRoutes = new Set(
    cypressBaselines(routes).flatMap((test) =>
      (test.routes ?? []).map(normalizeRoute),
    ),
  );
  const baselineClasses = new Set();
  for (const test of cypressBaselines(backend)) {
    for (const name of classNames(shard, test.backend?.test)) {
      baselineClasses.add(name);
    }
  }
  for (const entry of shard.backendBaselines) {
    if (backend.includes(entry.baseline?.name)) {
      for (const name of classNames(shard, entry.backend)) {
        baselineClasses.add(name);
      }
    }
  }

  return shard.tests.flatMap((entry) =>
    entry.tests.map((test) => {
      const classes = classNames(shard, test.backend?.test);
      if (includeBeforeTest) {
        for (const name of classNames(shard, test.backend?.beforeTest)) {
          classes.add(name);
        }
      }
      return {
        spec: entry.spec,
        title: test.title,
        attempt: test.attempt,
        state: test.state,
        functions: [...firedFunctions(test.f)].filter(
          (fn) => !baselineFunctions.has(fn),
        ),
        routes: [...new Set((test.routes ?? []).map(normalizeRoute))].filter(
          (route) => !baselineRoutes.has(route),
        ),
        backendClasses: [...classes].filter(
          (name) => name && !baselineClasses.has(name),
        ),
        events: test.events ?? [],
      };
    }),
  );
}

/**
 * Checks that an attempt's step cuts add up to its per-test data: function deltas sum to the flushed counts,
 * and backend dump windows follow each other in cut order.
 * Each backend dump resets the agent, so a gap between two windows is time whose hits no dump holds.
 */
export function checkSteps(test) {
  const cuts = test.steps?.cuts ?? [];
  const files = test.steps?.files ?? [];
  const sums = new Map();
  for (const cut of cuts) {
    const f = cut.f ?? [];
    for (let i = 0; i + 2 < f.length; i += 3) {
      const key = `${files[f[i]]}#${f[i + 1]}`;
      sums.set(key, (sums.get(key) ?? 0) + f[i + 2]);
    }
  }
  let mismatched = 0;
  let missing = 0;
  for (const [file, counts] of Object.entries(test.f ?? {})) {
    for (const [index, count] of Object.entries(counts)) {
      const key = `${file}#${index}`;
      if (!sums.has(key)) {
        missing += 1;
      } else if (sums.get(key) !== count) {
        mismatched += 1;
      }
      sums.delete(key);
    }
  }
  const frontend = { mismatched, missing, extra: sums.size };
  frontend.ok = mismatched === 0 && missing === 0 && sums.size === 0;

  const dumps = [
    test.backend?.beforeTest,
    ...cuts.map((cut) => cut.backend),
  ].filter(Boolean);
  const cutWindows = cuts.map((cut) => cut.backend?.window).filter(Boolean);
  let outOfOrder = 0;
  for (let i = 1; i < cutWindows.length; i++) {
    if (cutWindows[i].end < cutWindows[i - 1].end) {
      outOfOrder += 1;
    }
  }
  const windows = dumps
    .filter((dump) => dump.window)
    .map((dump) => dump.window)
    .sort((a, b) => a.start - b.start);
  let gapMs = 0;
  let overlapMs = 0;
  for (let i = 1; i < windows.length; i++) {
    const gap = windows[i].start - windows[i - 1].end;
    if (gap > 0) {
      gapMs += gap;
    } else {
      overlapMs -= gap;
    }
  }
  const backend = test.backend
    ? {
        dumps: dumps.length,
        failed: dumps.filter((dump) => dump.error).length,
        cutsWithoutDump: cuts.filter((cut) => !cut.backend).length,
        outOfOrder,
        gapMs,
        overlapMs,
        latencyMs: median(
          cuts.map((cut) => cut.backend?.latencyMs).filter((v) => v != null),
        ),
      }
    : null;
  return { cuts: cuts.length, frontend, backend };
}

/**
 * Per-test wall time of the same tests under two capture settings, matched by spec, title and attempt.
 * Wall time is the browser-measured test time plus the time the afterEach task waited for backend step dumps.
 */
export function compareTiming(tests, baselineTests) {
  const key = (entry, test) =>
    `${entry.spec}\u0000${test.title}\u0000${test.attempt}`;
  const wall = (test) => (test.durationMs ?? 0) + (test.capture?.drainMs ?? 0);
  const control = new Map();
  for (const entry of baselineTests) {
    for (const test of entry.tests) {
      control.set(key(entry, test), test);
    }
  }
  const pairs = [];
  for (const entry of tests) {
    for (const test of entry.tests) {
      const other = control.get(key(entry, test));
      if (other && test.durationMs != null && other.durationMs != null) {
        pairs.push([test, other]);
      }
    }
  }
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  const total = sum(pairs.map(([test]) => wall(test)));
  const totalControl = sum(pairs.map(([, other]) => wall(other)));
  return {
    tests: pairs.length,
    wallMs: total,
    controlWallMs: totalControl,
    slowdownPct: totalControl
      ? ((total / totalControl - 1) * 100).toFixed(1)
      : null,
    medianRatio: median(
      pairs.map(([test, other]) => wall(test) / Math.max(1, wall(other))),
    ),
    snapshotMs: sum(pairs.map(([test]) => test.capture?.snapshotMs ?? 0)),
    eventMs: sum(pairs.map(([test]) => test.capture?.eventMs ?? 0)),
    drainMs: sum(pairs.map(([test]) => test.capture?.drainMs ?? 0)),
    snapshots: sum(pairs.map(([test]) => test.capture?.snapshots ?? 0)),
  };
}

function formatTiming(label, timing) {
  if (timing.tests === 0) {
    return `  timing vs ${label}: no matching tests`;
  }
  const seconds = (ms) => (ms / 1000).toFixed(1);
  return (
    `  timing vs ${label}: ${timing.tests} matched attempts, wall ${seconds(timing.wallMs)}s vs ${seconds(timing.controlWallMs)}s ` +
    `(${timing.slowdownPct}%), median per-test ratio ${timing.medianRatio.toFixed(2)}; ` +
    `in the browser ${seconds(timing.snapshotMs)}s step snapshots over ${timing.snapshots} cuts and ${seconds(timing.eventMs)}s event handlers, ` +
    `${seconds(timing.drainMs)}s waiting for backend step dumps`
  );
}

function testLabel(entry, test) {
  return `${entry.spec} :: ${test.title} (attempt ${test.attempt})`;
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const MAX_LISTED = 20;
// Each dump's own write time shows up as a gap of a few milliseconds, so only larger gaps get a test listed.
const LISTED_GAP_MS = 50;

function summarize(runDir, { subtract, baselines, compareDir }) {
  const other = compareDir
    ? new Map(
        [...iterateRun(compareDir)].map((shard) => [
          shard.meta.shard?.index,
          shard,
        ]),
      )
    : null;
  for (const shard of iterateRun(runDir)) {
    const none = { frontend: [], routes: [], backend: [] };
    const raw = subtractBaselines(shard, none);
    const lines = [
      `${path.basename(shard.dir)}: ${raw.length} test attempts, ` +
        `${shard.baselines.length} Cypress baseline specs, ` +
        `${shard.backendBaselines.length} backend baselines, ` +
        `${shard.classes.length} backend classes`,
      `  raw median per attempt: ${median(raw.map((t) => t.functions.length))} functions, ` +
        `${median(raw.map((t) => t.routes.length))} routes, ` +
        `${median(raw.map((t) => t.backendClasses.length))} backend classes, ` +
        `${median(raw.map((t) => t.events.length))} events`,
    ];
    if (subtract) {
      const net = subtractBaselines(
        shard,
        baselines
          ? {
              frontend: baselines,
              routes: baselines,
              backend: [...baselines, "backend-idle"],
            }
          : undefined,
      );
      lines.push(
        `  after subtraction: ${median(net.map((t) => t.functions.length))} functions, ` +
          `${median(net.map((t) => t.routes.length))} routes, ` +
          `${median(net.map((t) => t.backendClasses.length))} backend classes`,
      );
    }

    const attempts = shard.tests.flatMap((entry) =>
      entry.tests.map((test) => ({ entry, test })),
    );
    const capture = attempts.map(({ test }) => test.capture ?? {});
    const sum = (key) => capture.reduce((n, c) => n + (c[key] ?? 0), 0);
    const requestEvents = attempts.reduce(
      (n, { test }) =>
        n +
        (test.events ?? []).filter((event) => event.initiator === "cy.request")
          .length,
      0,
    );
    lines.push(
      `  recording: ${sum("errors")} errors, ${sum("droppedEvents")} dropped events, ` +
        `${sum("droppedCuts")} dropped cuts, ${sum("lateCuts")} late cuts, ` +
        `${sum("lateStepDumpRequests")} late step dump requests; ` +
        `cy.request seen ${requestEvents} times through command:start and ${sum("requestOverwrites")} times through the command overwrite`,
    );

    const checked = attempts
      .filter(({ test }) => test.steps)
      .map(({ entry, test }) => ({ entry, test, check: checkSteps(test) }));
    if (checked.length > 0) {
      const frontendBad = checked.filter(({ check }) => !check.frontend.ok);
      const backendChecks = checked
        .map(({ check }) => check.backend)
        .filter(Boolean);
      lines.push(
        `  step consistency: ${checked.length} attempts with steps, median ${median(checked.map(({ check }) => check.cuts))} cuts, ` +
          `frontend sums differ in ${frontendBad.length}` +
          (backendChecks.length > 0
            ? `, backend gaps ${Math.max(...backendChecks.map((c) => c.gapMs))}ms max, ` +
              `overlaps ${Math.max(...backendChecks.map((c) => c.overlapMs))}ms max, ` +
              `${backendChecks.reduce((n, c) => n + c.outOfOrder, 0)} out-of-order dumps, ` +
              `${backendChecks.reduce((n, c) => n + c.cutsWithoutDump + c.failed, 0)} missing or failed dumps, ` +
              `median dump latency ${median(backendChecks.map((c) => c.latencyMs))}ms`
            : ""),
      );
      const flagged = checked.filter(
        ({ check }) =>
          !check.frontend.ok ||
          (check.backend &&
            (check.backend.gapMs > LISTED_GAP_MS ||
              check.backend.outOfOrder > 0 ||
              check.backend.failed > 0 ||
              check.backend.cutsWithoutDump > 0)),
      );
      for (const { entry, test, check } of flagged.slice(0, MAX_LISTED)) {
        const { frontend, backend } = check;
        lines.push(
          `    ${testLabel(entry, test)}: frontend ${frontend.mismatched} mismatched, ${frontend.missing} missing, ${frontend.extra} extra` +
            (backend
              ? `; backend ${backend.gapMs}ms gaps, ${backend.outOfOrder} out of order, ${backend.failed} failed, ${backend.cutsWithoutDump} cuts without a dump`
              : ""),
        );
      }
      if (flagged.length > MAX_LISTED) {
        lines.push(`    ... and ${flagged.length - MAX_LISTED} more`);
      }
    }
    for (const [variant, tests] of Object.entries(shard.variants)) {
      lines.push(
        formatTiming(`tests-${variant}`, compareTiming(shard.tests, tests)),
      );
    }
    const otherShard = other?.get(shard.meta.shard?.index);
    if (otherShard) {
      lines.push(
        formatTiming(compareDir, compareTiming(shard.tests, otherShard.tests)),
      );
    }
    for (const entry of shard.backendBaselines) {
      const exec = entry.backend?.exec
        ? jacoco.parseExecutionData(
            fs.readFileSync(path.join(shard.dir, entry.backend.exec)),
          )
        : null;
      lines.push(
        `  ${entry.baseline.name}${entry.baseline.position ? `-${entry.baseline.position}` : ""}: ` +
          `${entry.backend?.classes?.length ?? 0} classes` +
          (exec ? `, .exec holds ${exec.classes.length}` : "") +
          (entry.backend?.error ? `, failed: ${entry.backend.error}` : ""),
      );
    }
    console.log(lines.join("\n"));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [runDir, ...flags] = process.argv.slice(2);
  if (!runDir) {
    console.error(
      "Usage: node e2e/coverage/journey-capture.mjs <run dir> [--subtract] [--baselines <name,...>] [--compare <other run dir>]",
    );
    process.exit(1);
  }
  const flagValue = (flag) => {
    const at = flags.indexOf(flag);
    return at >= 0 ? flags[at + 1] : null;
  };
  summarize(runDir, {
    subtract: flags.includes("--subtract"),
    baselines: flagValue("--baselines")?.split(","),
    compareDir: flagValue("--compare"),
  });
}
