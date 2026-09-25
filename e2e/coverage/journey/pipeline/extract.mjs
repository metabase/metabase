// Usage: node extract.mjs <run dir> <out dir> <repo files dir> [<openapi.json>] [--rerun <run dir>]...
// Streams a journey-capture run one shard at a time through the capture reader (e2e/coverage/journey-capture.mjs)
// and writes, into <out dir>:
//   tests.jsonl           one line per test (its final attempt): per-test code sets and its steps, all as interned ids
//   vocab.json            the strings behind the ids
//   second-samples.json   the same test measured in a rerun, when both runs passed it
//   extract-summary.json  counts, timings, the rerun merge and problems found in the capture data
// A rerun replaces a test that never passed in the main run with its passing attempt, subtracted with the rerun shard's own baselines.
import fs from "node:fs";
import path from "node:path";

import * as reader from "../../journey-capture.mjs";
import { apiRoutes, normalizePages } from "../../routes.mjs";

import { loadMappings } from "./mappings.mjs";
import { LEVELS, buildPath, placeCuts, virtualCuts } from "./steps.mjs";

const positional = [];
const rerunDirs = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--rerun") {
    rerunDirs.push(argv[(i += 1)]);
  } else {
    positional.push(argv[i]);
  }
}
const [runDir, outDir, srcDir, openapiArg] = positional;
if (!runDir || !outDir || !srcDir) {
  console.error(
    "Usage: node extract.mjs <run dir> <out dir> <repo files dir> [<openapi.json>] [--rerun <run dir>]...",
  );
  process.exit(1);
}
const openapiFile =
  openapiArg ?? path.join(runDir, "journey-capture-openapi/openapi.json");

const maps = await loadMappings({ srcDir, openapiFile });

class Interner {
  constructor() {
    this.ids = new Map();
    this.values = [];
  }
  id(value) {
    let id = this.ids.get(value);
    if (id === undefined) {
      id = this.values.length;
      this.ids.set(value, id);
      this.values.push(value);
    }
    return id;
  }
}

const vocab = {
  fns: new Interner(),
  classes: new Interner(),
  routes: new Interner(),
  pages: new Interner(),
  tokens: Object.fromEntries(LEVELS.map((level) => [level, new Interner()])),
  asserts: Object.fromEntries(LEVELS.map((level) => [level, new Interner()])),
  helpers: new Interner(),
  specs: new Interner(),
};
const fnNames = new Map();

const problems = {
  eventsWithoutPhase: 0,
  eventsWithNullPhase: 0,
  eventsAfterLastCut: 0,
  cutsNotMatchingTrigger: 0,
  attemptsWithoutSteps: 0,
  cutsWithoutBackendDump: 0,
  failedBackendDumps: 0,
  frontendSumMismatches: 0,
  backendGapOver50ms: 0,
  backendOutOfOrderDumps: 0,
  absoluteFrontendFiles: new Set(),
  fnsOutsideRepo: 0,
  classIdConflicts: 0,
  classIdConflictExamples: [],
  unknownClassIndices: 0,
  assertChainsEndingInShould: 0,
  assertEvents: 0,
  virtualCutMismatches: 0,
  virtualCutMismatchExamples: [],
  recording: {
    errors: 0,
    droppedEvents: 0,
    droppedCuts: 0,
    lateCuts: 0,
    lateStepDumpRequests: 0,
  },
  lazyNamespaceLoads: 0,
  duplicateTitles: 0,
  suitePrefixWithOtherPhases: 0,
};
const classIdByName = new Map();
const gaps = [];
const baselineSets = { fe: [], be: [] };
const backendBaselineUnion = new Set();
const backendIdleUnion = new Set();

function recordBaselines(shard, inSummary) {
  const fe = new Set();
  const be = new Set();
  for (const entry of shard.baselines) {
    if (entry.baseline?.name !== "coverage-baseline") {
      continue;
    }
    for (const test of entry.tests) {
      for (const [file, counts] of Object.entries(test.f ?? {})) {
        for (const [index, count] of Object.entries(counts)) {
          if (count > 0) {
            fe.add(
              `${file.replace(/^\/home\/runner\/work\/metabase\/metabase\//, "")}#${index}`,
            );
          }
        }
      }
      for (const i of test.backend?.test?.classes ?? []) {
        be.add(shard.classes[i]?.[0]);
      }
    }
  }
  for (const entry of shard.backendBaselines) {
    if (entry.baseline?.name === "backend-idle") {
      for (const i of entry.backend?.classes ?? []) {
        backendIdleUnion.add(shard.classes[i]?.[0]);
      }
    }
  }
  for (const name of be) {
    backendBaselineUnion.add(name);
  }
  if (inSummary) {
    baselineSets.fe.push(fe);
    baselineSets.be.push(be);
  }
}

function gapSummary(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.map((v) => v.gapMs).sort((a, b) => a - b);
  const share = values
    .map((v) => v.gapMs / Math.max(1, v.wallMs))
    .sort((a, b) => a - b);
  const at = (list, q) =>
    list[Math.min(list.length - 1, Math.floor(q * list.length))];
  return {
    tests: values.length,
    median: at(sorted, 0.5),
    p90: at(sorted, 0.9),
    max: sorted.at(-1),
    medianShareOfWall: Number(at(share, 0.5).toFixed(4)),
    p90ShareOfWall: Number(at(share, 0.9).toFixed(4)),
  };
}

function stability(sets) {
  if (sets.length === 0) {
    return null;
  }
  const union = new Set(sets.flatMap((s) => [...s]));
  const common = [...sets[0]].filter((x) => sets.every((s) => s.has(x)));
  const sizes = sets.map((s) => s.size);
  return {
    shards: sets.length,
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
    inEveryShard: common.length,
    inAnyShard: union.size,
  };
}

// Cypress stops retrying after a pass, so the final attempt of a passing test is also its first passing attempt.
// Two tests with the same full title in one spec both start at attempt 0, so a repeated attempt index starts a new test.
function finalAttempts(tests) {
  const groups = [];
  const open = new Map();
  for (const test of tests) {
    let group = open.get(test.title);
    if (!group || test.attempt <= group.final.attempt) {
      if (group) {
        problems.duplicateTitles += 1;
      }
      group = { final: test, attempts: 0 };
      groups.push(group);
      open.set(test.title, group);
    }
    group.final = test;
    group.attempts += 1;
  }
  return groups;
}

function cutFunctions(files, f) {
  const out = {};
  for (let i = 0; i + 2 < f.length; i += 3) {
    const file = files[f[i]];
    (out[file] ??= {})[f[i + 1]] = f[i + 2];
  }
  return out;
}

// What a describe's `before` hooks added to the first test's routes, pages and backend classes.
// The root beforeEach dumps the backend right after those hooks, so `beforeTest` holds their backend code after their last step cut.
// `ownRoutes` and `ownPages` are the test's own share: whatever its body also requested or loaded, or that no event explains.
function suiteParts(events, test, netRoutes, netBeforeTest) {
  const inHooks = events.filter((e) => e.phase === "before all");
  const outside = events.filter((e) => e.phase !== "before all");
  const routesOf = (list) =>
    new Set(
      apiRoutes(
        list
          .filter((e) => e.kind === "request")
          .map((e) => `${e.method} ${e.path}`),
      ).map(maps.canonicalRoute),
    );
  const pagesOf = (list) =>
    new Set(
      normalizePages(
        list
          .filter((e) => e.kind === "nav" && e.how === "document")
          .map((e) => e.path),
      ),
    );
  const hookRoutes = routesOf(inHooks);
  const bodyRoutes = routesOf(outside);
  const hookPages = pagesOf(inHooks);
  const bodyPages = pagesOf(outside);
  const pages = normalizePages(test.pages);
  const afterHooks =
    events[events.findLastIndex((e) => e.phase === "before all") + 1];
  return {
    suiteMs:
      afterHooks && events.length ? Math.max(0, afterHooks.t - events[0].t) : 0,
    routes: netRoutes
      .filter((r) => hookRoutes.has(r))
      .map((r) => vocab.routes.id(r))
      .sort((a, b) => a - b),
    ownRoutes: netRoutes
      .filter((r) => !hookRoutes.has(r) || bodyRoutes.has(r))
      .map((r) => vocab.routes.id(r))
      .sort((a, b) => a - b),
    pages: pages.filter((p) => hookPages.has(p)).map((p) => vocab.pages.id(p)),
    ownPages: pages
      .filter((p) => !hookPages.has(p) || bodyPages.has(p))
      .map((p) => vocab.pages.id(p)),
    beforeTestClasses: netBeforeTest
      ? classIds(netBeforeTest.backendClasses)
      : [],
  };
}

function fnIds(functions) {
  const ids = [];
  for (const fn of functions) {
    if (fn.startsWith("/") || fn.startsWith("..")) {
      problems.fnsOutsideRepo += 1;
      problems.absoluteFrontendFiles.add(fn.slice(0, fn.lastIndexOf("#")));
      continue;
    }
    ids.push(vocab.fns.id(fn));
  }
  return ids.sort((a, b) => a - b);
}

const classIds = (names) =>
  names.map((n) => vocab.classes.id(n)).sort((a, b) => a - b);

function registerClasses(shard) {
  for (const [name, id] of shard.classes) {
    const seen = classIdByName.get(name);
    if (seen === undefined) {
      classIdByName.set(name, id);
    } else if (seen !== id) {
      problems.classIdConflicts += 1;
      if (problems.classIdConflictExamples.length < 10) {
        problems.classIdConflictExamples.push([name, seen, id]);
      }
    }
  }
}

function loadFnNames(dir) {
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("fnmap-"))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const [absFile, fns] of Object.entries(data)) {
      const rel = absFile.replace(
        /^\/home\/runner\/work\/metabase\/metabase\//,
        "",
      );
      if (!fnNames.has(rel)) {
        fnNames.set(rel, fns);
      }
    }
  }
}

function checkCuts(test) {
  const byseq = new Map(test.events.map((e) => [e.seq, e]));
  let bad = 0;
  for (const cut of test.steps.cuts) {
    const e = byseq.get(cut.triggerSeq);
    const ok =
      cut.trigger === "end" ||
      (cut.trigger === "assert" &&
        e?.kind === "assert" &&
        cut.seq === cut.triggerSeq + 1) ||
      (cut.trigger === "nav" &&
        e?.kind === "nav" &&
        cut.seq === cut.triggerSeq + 1) ||
      (cut.trigger === "document" &&
        e?.kind === "nav" &&
        e.how === "document" &&
        cut.seq === cut.triggerSeq) ||
      (cut.trigger === "command" && e?.kind === "command");
    if (!ok) {
      bad += 1;
    }
  }
  return bad;
}

function compareSequences(a, b) {
  let lcp = 0;
  while (lcp < a.length && lcp < b.length && a[lcp] === b[lcp]) {
    lcp += 1;
  }
  const bag = new Map();
  for (const k of a) {
    bag.set(k, (bag.get(k) ?? 0) + 1);
  }
  let common = 0;
  for (const k of b) {
    const n = bag.get(k) ?? 0;
    if (n > 0) {
      common += 1;
      bag.set(k, n - 1);
    }
  }
  return {
    same: lcp === a.length && a.length === b.length,
    lcp,
    lengths: [a.length, b.length],
    common,
  };
}

const jaccard = (a, b) => {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sb) {
    if (sa.has(x)) {
      inter += 1;
    }
  }
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
};

// One record per test of a shard, in file order, with the matching key and the source run.
function* shardRecords(dir, source, shardTimings) {
  const started = Date.now();
  const shard = reader.loadShard(dir);
  const loadedMs = Date.now() - started;
  const shardName = path.basename(dir);
  const meta = {
    shard: shardName,
    source,
    index: shard.meta.shard?.index,
    count: shard.meta.shard?.count,
    sha: shard.meta.sha,
    outcomes: shard.meta.outcomes,
    capture: shard.meta.capture,
  };
  registerClasses(shard);
  recordBaselines(shard, source === mainSource);
  loadFnNames(dir);

  const picked = shard.tests.map((entry) => ({
    entry,
    finals: finalAttempts(entry.tests),
  }));
  const finalShard = {
    ...shard,
    tests: picked.map(({ entry, finals }) => ({
      ...entry,
      tests: finals.map((x) => x.final),
    })),
  };
  const net = reader.subtractBaselines(finalShard);
  const stepRecords = [];
  let uid = 0;
  for (const { finals } of picked) {
    for (const { final: test } of finals) {
      const files = test.steps?.files ?? [];
      const testUid = uid;
      uid += 1;
      (test.steps?.cuts ?? []).forEach((cut, index) => {
        stepRecords.push({
          title: `${testUid}:${index}`,
          attempt: 0,
          f: cutFunctions(files, cut.f ?? []),
          routes: [],
          backend: { test: cut.backend ?? null },
        });
      });
      stepRecords.push({
        title: `${testUid}:beforeTest`,
        attempt: 0,
        f: {},
        routes: [],
        backend: { test: test.backend?.beforeTest ?? null },
      });
    }
  }
  const netSteps = reader.subtractBaselines({
    ...shard,
    tests: [{ spec: "steps", tests: stepRecords }],
  });
  const netStepByTitle = new Map(netSteps.map((s) => [s.title, s]));

  const control = new Map();
  const controlEntries = shard.variants.control ?? [];
  if (controlEntries.length > 0) {
    const controlFinals = controlEntries.map((entry) => ({
      ...entry,
      tests: finalAttempts(entry.tests).map((x) => x.final),
    }));
    const controlNet = reader.subtractBaselines({
      ...shard,
      tests: controlFinals,
    });
    let k = 0;
    for (const entry of controlFinals) {
      for (const test of entry.tests) {
        control.set(`${entry.spec}\u0000${test.title}`, {
          test,
          net: controlNet[k],
        });
        k += 1;
      }
    }
  }

  const outcome = {
    specs: shard.tests.length,
    tests: 0,
    attempts: 0,
    failed: 0,
    pending: 0,
    withoutSteps: 0,
    withoutBackend: 0,
    recordingErrors: 0,
    cutsWithoutDump: 0,
  };
  let k = 0;
  for (const { entry, finals } of picked) {
    const spec = entry.spec;
    const specId = vocab.specs.id(spec);
    const occurrences = new Map();
    for (const { final: test, attempts } of finals) {
      const occurrence = occurrences.get(test.title) ?? 0;
      occurrences.set(test.title, occurrence + 1);
      const netTest = net[k];
      k += 1;
      outcome.tests += 1;
      outcome.attempts += attempts;
      outcome.failed += test.state === "failed" ? 1 : 0;
      outcome.pending += test.state === "pending" ? 1 : 0;
      outcome.cutsWithoutDump += (test.steps?.cuts ?? []).filter(
        (c) => !c.backend?.classes,
      ).length;
      outcome.withoutSteps += test.steps ? 0 : 1;
      outcome.withoutBackend += test.backend?.test?.classes ? 0 : 1;
      outcome.recordingErrors += test.capture?.errors ?? 0;
      for (const key of Object.keys(problems.recording)) {
        problems.recording[key] += test.capture?.[key] ?? 0;
      }
      const events = test.events ?? [];
      problems.eventsWithoutPhase += events.filter(
        (e) => e.phase === undefined,
      ).length;
      problems.eventsWithNullPhase += events.filter(
        (e) => e.phase === null,
      ).length;
      const dumps = [
        test.backend?.test,
        test.backend?.beforeTest,
        ...(test.steps?.cuts ?? []).map((c) => c.backend),
      ];
      for (const dump of dumps) {
        problems.unknownClassIndices += (dump?.classes ?? []).filter(
          (i) => !shard.classes[i],
        ).length;
      }
      for (const e of events) {
        if (e.kind === "assert") {
          problems.assertEvents += 1;
          if (/\.(should|and)\([^()]*\)$/.test(e.chain ?? "")) {
            problems.assertChainsEndingInShould += 1;
          }
        }
      }

      const netRoutes = [
        ...new Set(apiRoutes(netTest.routes).map(maps.canonicalRoute)),
      ];
      const record = {
        id: null,
        source,
        shard: shardName,
        spec: specId,
        title: test.title,
        state: test.state,
        attempts,
        finalAttempt: test.attempt,
        durationMs: test.durationMs ?? null,
        wallMs: (test.durationMs ?? 0) + (test.capture?.drainMs ?? 0),
        events: events.length,
        key:
          occurrence === 0
            ? `${spec}::${test.title}`
            : `${spec}::${test.title} [${occurrence + 1}]`,
        fns: fnIds(netTest.functions),
        classes: classIds(netTest.backendClasses),
        routes: netRoutes.map((r) => vocab.routes.id(r)).sort((a, b) => a - b),
        pages: normalizePages(test.pages).map((p) => vocab.pages.id(p)),
        rawFnCount: Object.values(test.f ?? {}).reduce(
          (n, c) => n + Object.values(c).filter((v) => v > 0).length,
          0,
        ),
        rawClassCount: test.backend?.test?.classes?.length ?? 0,
        lazyNamespaces: (test.backend?.test?.classes ?? []).filter((i) =>
          shard.classes[i]?.[0]?.endsWith("__init"),
        ).length,
        suitePrefix: 0,
        suite: null,
        tokens: Object.fromEntries(LEVELS.map((level) => [level, []])),
        helpers: [],
        terminal: [],
        phases: [],
        cuts: [],
      };
      problems.lazyNamespaceLoads += record.lazyNamespaces;

      const { tokens, suitePrefix } = buildPath(events);
      record.suitePrefix = suitePrefix;
      if (tokens.slice(0, suitePrefix).some((t) => t.phase !== "before all")) {
        problems.suitePrefixWithOtherPhases += 1;
      }
      record.tokens = Object.fromEntries(
        LEVELS.map((level) => [
          level,
          tokens.map((t) => vocab.tokens[level].id(t[level])),
        ]),
      );
      record.helpers = tokens.map((t) =>
        t.helper ? vocab.helpers.id(t.helper) : -1,
      );
      record.terminal = tokens.map((t) => (t.terminal ? 1 : 0));
      record.phases = tokens.map((t) => t.phase);

      let placed = null;
      if (!test.steps) {
        problems.attemptsWithoutSteps += 1;
        // Without step snapshots the cuts are rebuilt from the events, so assertions keep their positions but carry no code.
        placed = placeCuts(events, virtualCuts(events), tokens).placed;
        record.cuts = placed.map((entry) => ({
          pos: entry.pos,
          trigger: entry.trigger,
          triggerText: entry.triggerText,
          phase: entry.cut.phase,
          t: null,
          inFlight: 0,
          latencyMs: null,
          fns: [],
          classes: [],
          rawFns: 0,
          rawClasses: 0,
          virtual: true,
          asserts: Object.fromEntries(
            LEVELS.map((level) => [
              level,
              entry.asserts.map((a) => vocab.asserts[level].id(a[level])),
            ]),
          ),
          assertChains: entry.asserts.map((a) => a.chain),
          requests: [...new Set(entry.requests.map(maps.canonicalRoute))].map(
            (r) => vocab.routes.id(r),
          ),
          urls: [...new Set(entry.urls)],
        }));
      } else {
        const check = reader.checkSteps(test);
        record.check = {
          frontendOk: check.frontend.ok,
          gapMs: check.backend?.gapMs ?? null,
          latencyMs: check.backend?.latencyMs ?? null,
        };
        if (!check.frontend.ok) {
          problems.frontendSumMismatches += 1;
        }
        if ((check.backend?.gapMs ?? 0) > 50) {
          problems.backendGapOver50ms += 1;
        }
        problems.backendOutOfOrderDumps += check.backend?.outOfOrder ?? 0;
        if (check.backend) {
          gaps.push({
            gapMs: check.backend.gapMs,
            wallMs: (test.durationMs ?? 0) + (test.capture?.drainMs ?? 0),
          });
        }
        problems.cutsWithoutBackendDump += check.backend?.cutsWithoutDump ?? 0;
        problems.failedBackendDumps += check.backend?.failed ?? 0;
        problems.cutsNotMatchingTrigger += checkCuts(test);

        const virtual = virtualCuts(events, test.steps.mode);
        const real = test.steps.cuts
          .map((c) => `${c.seq}:${c.trigger}`)
          .slice(0, -1)
          .join(",");
        const rebuilt = virtual
          .map((c) => `${c.seq}:${c.trigger}`)
          .slice(0, -1)
          .join(",");
        if (real !== rebuilt) {
          problems.virtualCutMismatches += 1;
          if (problems.virtualCutMismatchExamples.length < 5) {
            problems.virtualCutMismatchExamples.push({
              spec,
              title: test.title,
              real: real.slice(0, 300),
              rebuilt: rebuilt.slice(0, 300),
            });
          }
        }

        const result = placeCuts(events, test.steps.cuts, tokens);
        placed = result.placed;
        problems.eventsAfterLastCut += result.orphans;
        record.cuts = placed.map((entry, index) => {
          const cut = entry.cut;
          const netStep = netStepByTitle.get(`${k - 1}:${index}`);
          return {
            pos: entry.pos,
            trigger: entry.trigger,
            triggerText: entry.triggerText,
            phase: cut.phase,
            t: cut.t,
            inFlight: cut.inFlight ?? 0,
            latencyMs: cut.backend?.latencyMs ?? null,
            fns: netStep ? fnIds(netStep.functions) : [],
            classes: netStep ? classIds(netStep.backendClasses) : [],
            rawFns: (cut.f?.length ?? 0) / 3,
            rawClasses: cut.backend?.classes?.length ?? 0,
            asserts: Object.fromEntries(
              LEVELS.map((level) => [
                level,
                entry.asserts.map((a) => vocab.asserts[level].id(a[level])),
              ]),
            ),
            assertChains: entry.asserts.map((a) => a.chain),
            requests: [...new Set(entry.requests.map(maps.canonicalRoute))].map(
              (r) => vocab.routes.id(r),
            ),
            urls: [...new Set(entry.urls)],
          };
        });
      }

      if (
        suitePrefix > 0 ||
        record.cuts.some((c) => c.phase === "before all")
      ) {
        record.suite = suiteParts(
          events,
          test,
          netRoutes,
          netStepByTitle.get(`${k - 1}:beforeTest`),
        );
      }

      const other = control.get(`${spec}\u0000${test.title}`);
      if (other) {
        const controlEvents = other.test.events ?? [];
        const controlPath = buildPath(controlEvents).tokens;
        const controlCuts = placeCuts(
          controlEvents,
          virtualCuts(controlEvents, test.steps?.mode),
          controlPath,
        ).placed;
        const ownCuts =
          placed ??
          placeCuts(events, virtualCuts(events, test.steps?.mode), tokens)
            .placed;
        record.control = {
          state: other.test.state,
          wallMs:
            (other.test.durationMs ?? 0) + (other.test.capture?.drainMs ?? 0),
          fnJaccard: jaccard(netTest.functions, other.net.functions),
          classJaccard: jaccard(
            netTest.backendClasses,
            other.net.backendClasses,
          ),
          routeJaccard: jaccard(netTest.routes, other.net.routes),
        };
        for (const level of LEVELS) {
          record.control[level] = compareSequences(
            tokens.map((t) => t[level]),
            controlPath.map((t) => t[level]),
          );
        }
        const assertsOf = (list) =>
          list.flatMap((entry) => entry.asserts.map((a) => a.normalized));
        record.control.assertJaccard = jaccard(
          assertsOf(ownCuts),
          assertsOf(controlCuts),
        );
        record.control.cutPositions = compareSequences(
          ownCuts.map((e) => `${e.pos}:${e.trigger}`),
          controlCuts.map((e) => `${e.pos}:${e.trigger}`),
        );
      }
      yield {
        key: `${spec}\u0000${test.title}\u0000${occurrence}`,
        record,
        meta,
      };
    }
  }
  shardTimings.push({
    shard: shardName,
    source,
    index: shard.meta.shard?.index,
    tests: k,
    loadMs: loadedMs,
    totalMs: Date.now() - started,
    outcomes: shard.meta.outcomes,
    ...outcome,
  });
  console.error(
    `${source} ${shardName}: ${k} tests in ${Date.now() - started} ms`,
  );
}

// What a second sample of the same test is compared on.
function sampleView(record) {
  return {
    id: record.id,
    state: record.state,
    attempts: record.attempts,
    source: record.source,
    fns: record.fns,
    classes: record.classes,
    routes: record.routes,
    tokens: record.tokens,
    asserts: record.cuts.flatMap((c) => c.asserts.normalized),
    cutPositions: record.cuts.map((c) => `${c.pos}:${c.trigger}`),
  };
}

function compareSamples(a, b) {
  const union = new Set(
    [...backendBaselineUnion].map((name) => vocab.classes.ids.get(name)),
  );
  const outside = (classes) => classes.filter((c) => !union.has(c));
  return {
    fnJaccard: jaccard(a.fns, b.fns),
    classJaccard: jaccard(a.classes, b.classes),
    classJaccardUnion: jaccard(outside(a.classes), outside(b.classes)),
    routeJaccard: jaccard(a.routes, b.routes),
    assertJaccard: jaccard(a.asserts, b.asserts),
    exact: compareSequences(a.tokens.exact, b.tokens.exact),
    normalized: compareSequences(a.tokens.normalized, b.tokens.normalized),
    cutPositions: compareSequences(a.cutPositions, b.cutPositions),
  };
}

const runName = (dir) => path.basename(path.resolve(dir));
const mainSource = runName(runDir);

function specsOf(dir) {
  const specs = new Set();
  for (const shardDir of reader.shardDirs(dir)) {
    const testsDir = path.join(shardDir, "tests");
    for (const file of fs.existsSync(testsDir)
      ? fs.readdirSync(testsDir)
      : []) {
      specs.add(
        JSON.parse(fs.readFileSync(path.join(testsDir, file), "utf8")).spec,
      );
    }
  }
  return specs;
}

fs.mkdirSync(outDir, { recursive: true });
const testsFile = path.join(outDir, "tests.jsonl");
const out = fs.createWriteStream(testsFile);
const shardTimings = [];
const shardMeta = [];
let testCount = 0;
let attemptCount = 0;
let sha = null;

const rerunSpecs = new Set(rerunDirs.flatMap((dir) => [...specsOf(dir)]));
const mainIndex = new Map();
for (const dir of reader.shardDirs(runDir)) {
  let first = true;
  for (const { key, record, meta } of shardRecords(
    dir,
    mainSource,
    shardTimings,
  )) {
    if (first) {
      shardMeta.push(meta);
      sha ??= meta.sha;
      first = false;
    }
    record.id = testCount;
    testCount += 1;
    attemptCount += record.attempts;
    if (rerunSpecs.has(vocab.specs.values[record.spec])) {
      mainIndex.set(key, sampleView(record));
    }
    out.write(JSON.stringify(record) + "\n");
  }
}

// The problem counts in the summary are the main run's.
const mainProblems = JSON.parse(
  JSON.stringify({
    ...problems,
    absoluteFrontendFiles: [...problems.absoluteFrontendFiles].slice(0, 20),
    classNamesSeen: classIdByName.size,
    coverageBaselineAcrossShards: {
      fe: stability(baselineSets.fe),
      be: stability(baselineSets.be),
    },
    backendGapMs: gapSummary(gaps),
  }),
);

const merge = {
  reruns: [],
  replaced: [],
  stillNotPassing: [],
  secondSamples: 0,
  rerunOnly: [],
  rerunFailedMainPassed: [],
};
const samples = [];
const replacements = new Map();
const annotations = new Map();
for (const rerunDir of rerunDirs) {
  const source = runName(rerunDir);
  const rerunShas = new Set();
  let rerunTests = 0;
  for (const dir of reader.shardDirs(rerunDir)) {
    for (const { key, record, meta } of shardRecords(
      dir,
      source,
      shardTimings,
    )) {
      rerunShas.add(meta.sha);
      rerunTests += 1;
      const main = mainIndex.get(key);
      const label = {
        spec: vocab.specs.values[record.spec],
        title: record.title,
      };
      if (!main) {
        record.id = testCount;
        testCount += 1;
        record.rerunOnly = true;
        out.write(JSON.stringify(record) + "\n");
        merge.rerunOnly.push({ ...label, state: record.state });
      } else if (
        main.state !== "passed" &&
        record.state === "passed" &&
        !replacements.has(main.id)
      ) {
        record.id = main.id;
        record.replaces = {
          source: main.source,
          state: main.state,
          attempts: main.attempts,
        };
        replacements.set(main.id, record);
        merge.replaced.push({ ...label, id: main.id, mainState: main.state });
      } else if (main.state === "passed" && record.state === "passed") {
        record.id = main.id;
        samples.push({
          id: main.id,
          ...label,
          source,
          ...compareSamples(main, sampleView(record)),
        });
        merge.secondSamples += 1;
      } else {
        const note = annotations.get(main.id) ?? { rerunStates: [] };
        note.rerunStates.push({ source, state: record.state });
        annotations.set(main.id, note);
        if (main.state === "passed") {
          merge.rerunFailedMainPassed.push({
            ...label,
            id: main.id,
            rerunState: record.state,
          });
        }
      }
    }
  }
  merge.reruns.push({
    source,
    dir: path.resolve(rerunDir),
    tests: rerunTests,
    shas: [...rerunShas],
    sameShaAsMain: rerunShas.size === 1 && rerunShas.has(sha),
  });
}
await new Promise((resolve) => out.end(resolve));

for (const [id, note] of annotations) {
  if (!replacements.has(id)) {
    const main = [...mainIndex.values()].find((m) => m.id === id);
    if (main && main.state !== "passed") {
      merge.stillNotPassing.push({
        id,
        state: main.state,
        reruns: note.rerunStates,
      });
    }
  }
}

if (replacements.size > 0 || annotations.size > 0) {
  const { createInterface } = await import("node:readline");
  const tmp = `${testsFile}.tmp`;
  const rewritten = fs.createWriteStream(tmp);
  for await (const line of createInterface({
    input: fs.createReadStream(testsFile),
    crlfDelay: Infinity,
  })) {
    if (!line) {
      continue;
    }
    const id = Number(line.slice(6, line.indexOf(",")));
    const replacement = replacements.get(id);
    const note = annotations.get(id);
    if (replacement) {
      rewritten.write(
        JSON.stringify(
          note
            ? { ...replacement, rerunStates: note.rerunStates }
            : replacement,
        ) + "\n",
      );
    } else if (note) {
      rewritten.write(
        JSON.stringify({ ...JSON.parse(line), rerunStates: note.rerunStates }) +
          "\n",
      );
    } else {
      rewritten.write(line + "\n");
    }
  }
  await new Promise((resolve) => rewritten.end(resolve));
  fs.renameSync(tmp, testsFile);
}
fs.writeFileSync(
  path.join(outDir, "second-samples.json"),
  JSON.stringify(samples),
);

const fnLabel = (fn) => {
  const at = fn.lastIndexOf("#");
  const meta = fnNames.get(fn.slice(0, at))?.[fn.slice(at + 1)];
  return meta ? `${meta.name}:${meta.line}` : "";
};

fs.writeFileSync(
  path.join(outDir, "vocab.json"),
  JSON.stringify({
    sha,
    fns: vocab.fns.values,
    fnNames: vocab.fns.values.map(fnLabel),
    classes: vocab.classes.values,
    classNs: vocab.classes.values.map(maps.classNs),
    routes: vocab.routes.values,
    routeModules: vocab.routes.values.map(maps.beModuleOfRoute),
    pages: vocab.pages.values,
    specs: vocab.specs.values,
    tokens: Object.fromEntries(
      LEVELS.map((level) => [level, vocab.tokens[level].values]),
    ),
    helpers: vocab.helpers.values,
    backendBaselineUnion: [...backendBaselineUnion]
      .filter((name) => vocab.classes.ids.has(name))
      .map((name) => vocab.classes.ids.get(name)),
    backendIdleUnion: [...backendIdleUnion]
      .filter((name) => vocab.classes.ids.has(name))
      .map((name) => vocab.classes.ids.get(name)),
    asserts: Object.fromEntries(
      LEVELS.map((level) => [level, vocab.asserts[level].values]),
    ),
  }),
);

const files = [
  ...new Set(vocab.fns.values.map((fn) => fn.slice(0, fn.lastIndexOf("#")))),
];
const namespaces = [...new Set(vocab.classes.values.map(maps.classNs))];
fs.writeFileSync(
  path.join(outDir, "modules.json"),
  JSON.stringify({
    feModuleOfFile: Object.fromEntries(
      files.map((f) => [f, maps.feModuleOf(f)]),
    ),
    feAreaOfFile: Object.fromEntries(files.map((f) => [f, maps.feAreaOf(f)])),
    beModuleOfNs: Object.fromEntries(
      namespaces.map((ns) => [ns, maps.beModuleOfNs(ns)]),
    ),
    hasOpenapi: maps.hasOpenapi,
  }),
);

fs.writeFileSync(
  path.join(outDir, "extract-summary.json"),
  JSON.stringify(
    {
      sha,
      tests: testCount,
      attempts: attemptCount,
      shards: shardTimings.filter((t) => t.source === mainSource),
      rerunShards: shardTimings.filter((t) => t.source !== mainSource),
      merge,
      shardsExpected: shardMeta[0]?.count ?? null,
      missingShardIndices: shardMeta[0]?.count
        ? [...Array(shardMeta[0].count).keys()].filter(
            (i) => !shardMeta.some((m) => m.index === i),
          )
        : [],
      shasSeen: [...new Set(shardMeta.map((m) => m.sha))],
      shardMeta,
      vocab: {
        fns: vocab.fns.values.length,
        classes: vocab.classes.values.length,
        routes: vocab.routes.values.length,
        tokens: Object.fromEntries(
          LEVELS.map((level) => [level, vocab.tokens[level].values.length]),
        ),
        asserts: Object.fromEntries(
          LEVELS.map((level) => [level, vocab.asserts[level].values.length]),
        ),
      },
      problems: mainProblems,
      classIdConflictsIncludingReruns: problems.classIdConflicts,
    },
    null,
    1,
  ),
);
console.error(`${testCount} tests (${attemptCount} attempts) -> ${outDir}`);
