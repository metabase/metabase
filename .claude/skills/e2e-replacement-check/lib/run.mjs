import fs from "node:fs";
import path from "node:path";

import { prepareBreaks } from "./breaks.mjs";
import { gitDir, porcelain, unifiedDiff } from "./git.mjs";
import { createGuard, installInterruptHandlers, refuseUncommitted } from "./guard.mjs";
import { deftestObservation, jestObservation, judge, observed } from "./judge.mjs";
import { planAutomaticMutants } from "./mutants.mjs";
import { listRelatedSpecs, runDeftests, runJest, runTypeCheck } from "./runners.mjs";
import { loadTypescript, parseDeftests } from "./scope.mjs";

const uniq = (xs) => [...new Set(xs)];
const specOf = (id) => id.split("::")[0];
const isFrontendFile = (f) => /\.(ts|tsx|js|jsx)$/.test(f);

const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) {
    i++;
  }
  return i;
};

// Picks the statements a change sits on: those inside its line ranges, else the smallest statement around them.
// Source-mapped coverage has no statement for some JSX, and then whether a spec ran the line is unknown.
function targetStatements(statements, ranges) {
  if (!statements) {
    return null;
  }
  const inside = [];
  statements.forEach(([s, e], i) => {
    if (ranges.some(([a, b]) => s >= a && e <= b)) {
      inside.push(i);
    }
  });
  if (inside.length) {
    return inside;
  }
  let best = -1;
  let span = Infinity;
  statements.forEach(([s, e], i) => {
    if (ranges.every(([a, b]) => s <= a && e >= b) && e - s < span) {
      best = i;
      span = e - s;
    }
  });
  return best >= 0 ? [best] : null;
}

// Returns the specs whose clean run executed a changed line, or null when the coverage can't say.
function specsRunningLines(group, changes) {
  const out = new Set();
  for (const c of changes) {
    const targets = targetStatements(group.statements[c.file], c.lines);
    for (const spec of group.specs) {
      if (group.suiteErrors.has(spec)) {
        continue;
      }
      const covered = group.covered.get(spec);
      if (!covered) {
        return null;
      }
      const hits = covered[c.file];
      if (!hits) {
        continue;
      }
      if (targets === null) {
        return null;
      }
      if (targets.some((i) => hits.includes(i))) {
        out.add(spec);
      }
    }
  }
  return [...out];
}

function failureWords(f) {
  if (f.reason === "not reproduced on rerun") {
    return "a failure that didn't reproduce on rerun";
  }
  if (f.reason === "fails on a clean rerun") {
    return "a failure that also happens on clean code";
  }
  if (f.reason === "not rerun" || f.reason === "clean rerun missing") {
    return "a failure that couldn't be confirmed";
  }
  if (f.reason === "rerun didn't finish" || f.reason === "clean rerun didn't finish") {
    return `a failure whose ${f.reason.replace(" didn't finish", "")} didn't finish`;
  }
  return (
    {
      "product-exception": "an error from product code, not an assertion",
      "suite-error": "its spec failing to load",
      timeout: "a timeout",
      exception: "an exception, not an assertion",
    }[f.kind] ?? f.kind
  );
}

function multisetDiff(after, before) {
  const key = (l) => l.replace(/\(\d+,\d+\)/, "");
  const left = new Map();
  for (const l of before) {
    left.set(key(l), (left.get(key(l)) ?? 0) + 1);
  }
  return after.filter((l) => {
    const n = left.get(key(l)) ?? 0;
    if (n > 0) {
      left.set(key(l), n - 1);
    }
    return n === 0;
  });
}

function testSourceFor(root, file) {
  const candidates = [];
  if (file.startsWith("src/")) {
    candidates.push(file.replace(/^src\//, "test/"));
  }
  if (file.startsWith("enterprise/backend/src/")) {
    candidates.push(file.replace(/^enterprise\/backend\/src\//, "enterprise/backend/test/"));
  }
  const driver = file.match(/^(modules\/drivers\/[^/]+)\/src\/(.*)$/);
  if (driver) {
    candidates.push(`${driver[1]}/test/${driver[2]}`);
  }
  for (const c of candidates) {
    const test = c.replace(/\.(clj|cljc)$/, "_test.$1");
    if (fs.existsSync(path.join(root, test))) {
      return test;
    }
  }
  return null;
}

export async function runCheck({ root, scope, raw, outDir, options, log }) {
  const started = Date.now();
  const logFile = path.join(outDir, "run.log");
  const tmpDir = path.join(outDir, "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(logFile, "");
  const guard = createGuard({ root, stateDir: path.join(gitDir(root), "e2e-replacement-check") });
  const recovered = guard.recoverLeftover();
  if (recovered.length) {
    log(`Restored ${recovered.join(", ")} from an interrupted run before starting.`);
  }
  const children = new Set();
  const uninstall = installInterruptHandlers(guard, { children, log });
  const ts = loadTypescript(root);
  const timings = {};
  const time = async (key, fn) => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      timings[key] = (timings[key] ?? 0) + (Date.now() - t);
    }
  };

  const breaks = prepareBreaks({ root, ts, scope, raw });
  const touched = uniq(breaks.flatMap((b) => b.changes.map((c) => c.file)));
  try {
    refuseUncommitted(root, touched);
  } catch (error) {
    uninstall();
    throw error;
  }

  let jestRun = 0;
  const jest = (specs, extra = {}) =>
    runJest({ root, specs, resultsFile: path.join(tmpDir, `jest-${++jestRun}.json`), children, logFile, ...extra });

  const frontendFiles = touched.filter(isFrontendFile);
  const prSpecs = scope.unit.jest.map((j) => j.spec);
  const newTestIds = new Set(scope.unit.jest.flatMap((j) => j.new_tests.map((t) => `${j.spec}::${t}`)));

  const groups = {};
  const relatedByFile = new Map();
  async function baselineGroup(name, specs) {
    if (!specs.length) {
      return { name, specs: [], statuses: new Map(), covered: new Map(), statements: {}, suiteErrors: new Map(), ok: true };
    }
    log(`Running ${specs.length} ${name} spec(s) on clean code with coverage...`);
    const r = await time(`baseline ${name}`, () => jest(specs, { coverageFiles: frontendFiles }));
    const statuses = new Map([...r.tests].map(([id, t]) => [id, t.status]));
    const failing = [...statuses].filter(([, s]) => s === "failed").map(([id]) => id);
    if (failing.length) {
      log(`  ${failing.length} test(s) fail on clean code and are left out: ${failing.slice(0, 3).join("; ")}`);
    }
    for (const [spec, error] of r.suiteErrors) {
      log(`  ${spec} doesn't run on clean code: ${error.split("\n")[0].slice(0, 200)}`);
    }
    return { name, specs, ...r, statuses, cleanFailing: failing };
  }

  async function runAgainst(group, changes, tag) {
    const specs = group.specs.filter((s) => !group.suiteErrors.has(s));
    if (!specs.length) {
      return { ran: [], caught_by: [], errored: [], unconfirmed: [], failures: {}, specs: [] };
    }
    const clean = group.statuses;
    let broken = new Map();
    let rerun;
    await guard.withBreak(changes, async () => {
      const r1 = await time(tag, () => jest(specs));
      if (!r1.ok) {
        broken = null;
        return;
      }
      broken = observed([...r1.tests.keys()], r1.tests, jestObservation);
      for (const [spec, error] of r1.suiteErrors) {
        for (const [id, status] of clean) {
          if (specOf(id) === spec && status === "passed") {
            broken.set(id, { status: "failed", kind: "suite-error", message: error.slice(0, 600) });
          }
        }
      }
      const failing = [...broken].filter(([id, o]) => o.status === "failed" && clean.get(id) === "passed").map(([id]) => id);
      if (failing.length) {
        const r2 = await time(tag, () => jest(uniq(failing.map(specOf))));
        rerun = observed(failing, r2.tests, jestObservation);
      }
    });
    if (broken === null) {
      return { unmeasured: "jest wrote no results", ran: [], caught_by: [], errored: [], unconfirmed: [], failures: {}, specs };
    }
    let j = judge({ clean, broken, rerun });
    if (j.unconfirmed.length) {
      const r3 = await time(tag, () => jest(uniq(j.unconfirmed.map(specOf))));
      j = judge({ clean, broken, rerun, cleanRerun: observed(j.unconfirmed, r3.tests, jestObservation) });
    }
    return { ...j, specs };
  }

  let tscBaseline;
  async function typeCheck(changes, tag) {
    if (tscBaseline === undefined) {
      log("Running the type checker on clean code...");
      tscBaseline = await time("type check", () => runTypeCheck({ root, children, logFile }));
    }
    if (!tscBaseline.ok) {
      return { unmeasured: tscBaseline.reason };
    }
    let r;
    await guard.withBreak(changes, async () => {
      r = await time(tag, () => runTypeCheck({ root, children, logFile }));
    });
    if (!r.ok) {
      return { unmeasured: r.reason };
    }
    const fresh = multisetDiff(r.errors, tscBaseline.errors);
    return { caught: fresh.length > 0, errors: fresh.slice(0, 5) };
  }

  const results = [];
  let backendCleanFailing = [];
  const feBreaks = breaks.filter((b) => !b.unmeasured && b.lang === "frontend");
  const beBreaks = breaks.filter((b) => !b.unmeasured && b.lang === "backend");
  const autoMutants = options.auto && frontendFiles.length ? planAutomaticMutants({ root, ts, breaks, limit: options.autoLimit }) : [];

  if (feBreaks.length || autoMutants.length) {
    groups.pr = await baselineGroup("PR", prSpecs);
    if (options.related) {
      for (const file of frontendFiles) {
        const listed = await time("related specs", () => listRelatedSpecs({ root, file, children, logFile }));
        relatedByFile.set(
          file,
          listed
            .filter((s) => !prSpecs.includes(s))
            .sort((a, b) => commonPrefix(b, file) - commonPrefix(a, file) || a.localeCompare(b))
            .slice(0, options.relatedLimit),
        );
      }
      groups.related = await baselineGroup("related", uniq([...relatedByFile.values()].flat()));
    }
  }

  async function frontendResult(item, kind) {
    const fe = item.changes.filter((c) => isFrontendFile(c.file));
    const out = { stages: {} };
    const runLines = (g) => (g ? specsRunningLines(g, fe) : null);
    const prRan = runLines(groups.pr);
    const relatedRan = runLines(groups.related);
    const usedGroups = [groups.pr, groups.related].filter((g) => g?.specs.length);
    const ranBy = usedGroups.map(runLines);
    out.line_ran_in = ranBy.length && ranBy.every((x) => x !== null) ? uniq(ranBy.flat()) : null;

    if (kind === "auto" && out.line_ran_in && out.line_ran_in.length === 0) {
      out.result = { state: "not-run", text: "no spec ran the line" };
      return out;
    }
    const prGroup = kind === "auto" && prRan ? { ...groups.pr, specs: groups.pr.specs.filter((s) => prRan.includes(s)) } : groups.pr;
    const pr = await runAgainst(prGroup, fe, `${kind} PR`);
    out.stages.pr = pr;
    if (pr.caught_by.length) {
      return { ...out, result: { state: "caught", by: pr.caught_by, layer: "pr" } };
    }
    if (groups.related && options.related) {
      const own = (spec) =>
        fe.some((c) => (relatedByFile.get(c.file) ?? []).includes(spec) && (!groups.related.covered.get(spec) || groups.related.covered.get(spec)[c.file]));
      const relSpecs = groups.related.specs.filter((s) => own(s) && (kind !== "auto" || !relatedRan || relatedRan.includes(s)));
      const relGroup = { ...groups.related, specs: relSpecs };
      const rel = await runAgainst(relGroup, fe, `${kind} related`);
      out.stages.related = rel;
      if (rel.caught_by.length) {
        return { ...out, result: { state: "caught", by: rel.caught_by, layer: "existing" } };
      }
    }
    if (kind === "break" && options.typeCheck) {
      const tc = await typeCheck(fe, "type check");
      out.stages.type_check = tc;
      if (tc.caught) {
        return { ...out, result: { state: "caught", by: ["the type checker"], layer: "type-check" } };
      }
    }
    const stages = Object.values(out.stages).filter((s) => s.ran);
    const ran = stages.flatMap((s) => s.ran);
    const problems = stages.flatMap((s) => [...s.errored, ...s.unconfirmed]);
    if (problems.length) {
      const id = problems[0];
      const f = stages.find((s) => s.failures[id]).failures[id];
      return { ...out, result: { state: "unmeasured", text: `${shortTest(id)} failed with ${failureWords(f)}` } };
    }
    if (!ran.length) {
      const reasons = Object.values(out.stages).map((s) => s.unmeasured).filter(Boolean);
      const text = reasons.length
        ? reasons[0]
        : prSpecs.length
          ? "no unit test passed on clean code to run against"
          : "this PR has no frontend unit specs and no related spec ran";
      return { ...out, result: { state: "unmeasured", text } };
    }
    return { ...out, result: { state: "nothing", noLine: out.line_ran_in !== null && out.line_ran_in.length === 0, prHasSpecs: prSpecs.length > 0 } };
  }

  for (const b of breaks) {
    const t = Date.now();
    const row = { ...b, results: {} };
    results.push(row);
    if (b.unmeasured) {
      row.result = { state: "unmeasured", text: b.unmeasured };
      continue;
    }
    if (feBreaks.includes(b)) {
      log(`Break ${b.id}: ${b.description}`);
      row.results.frontend = await frontendResult(b, "break");
      row.result = row.results.frontend.result;
    }
    row.ms = Date.now() - t;
  }

  if (beBreaks.length) {
    const drivers = (process.env.DRIVERS || "").split(",").filter(Boolean);
    const prDeftests = scope.unit.deftests.filter((d) => !d.driver || drivers.includes(d.driver));
    const needsDriver = scope.unit.deftests.filter((d) => d.driver && !drivers.includes(d.driver));
    const runnable = beBreaks.slice(0, options.backendLimit);
    for (const b of beBreaks.slice(options.backendLimit)) {
      const row = results.find((r) => r.id === b.id);
      row.result = { state: "unmeasured", text: `over the limit of ${options.backendLimit} backend breaks per run; raise it with --backend-limit` };
    }
    const prIds = prDeftests.map((d) => d.id);
    const driverOf = (f) => f.match(/^modules\/drivers\/([^/]+)\/test\//)?.[1] ?? null;
    const relatedTests = (b) => b.changes.map((c) => testSourceFor(root, c.file)).filter(Boolean);
    const relatedFor = (b) =>
      uniq(
        relatedTests(b)
          .filter((f) => !driverOf(f) || drivers.includes(driverOf(f)))
          .map((f) => parseDeftests(fs.readFileSync(path.join(root, f), "utf8")).ns)
          .filter(Boolean),
      );
    const driversMissingFor = (b) =>
      uniq([...needsDriver.map((d) => d.driver), ...relatedTests(b).map(driverOf).filter((d) => d && !drivers.includes(d))]);
    const selectorsFor = (b) => backendSelectors(prIds, relatedFor(b));
    const selectors = backendSelectors(prIds, runnable.flatMap(relatedFor));
    const driverFlag = prDeftests.some((d) => d.driver) ? drivers.join(",") : null;
    let clean = null;
    if (selectors.length) {
      log(`Running ${selectors.length} backend test selector(s) on clean code with bin/test-agent...`);
      const r = await time("baseline backend", () => runDeftests({ root, selectors, drivers: driverFlag, children, logFile }));
      clean = r.ok ? new Map([...r.tests].map(([id, t]) => [id, t.status === "passed" || t.status === "skipped" ? t.status : "failed"])) : null;
      if (!r.ok) {
        log(`  bin/test-agent reported no results on clean code:\n${r.outputTail}`);
      }
      backendCleanFailing = [...(clean ?? [])].filter(([id, s]) => s === "failed" && prIds.includes(id)).map(([id]) => id);
      const empty = [...(clean ?? [])].filter(([, s]) => s === "skipped").map(([id]) => id);
      if (empty.length) {
        log(`  ${empty.length} deftest(s) ran no assertions on clean code and are left out: ${empty.slice(0, 3).join(", ")}`);
      }
    }
    for (const b of runnable) {
      const row = results.find((r) => r.id === b.id);
      const t = Date.now();
      log(`Break ${b.id} (backend): ${b.description}`);
      const be = b.changes.filter((c) => !isFrontendFile(c.file));
      const own = selectorsFor(b);
      let outcome;
      if (!own.length) {
        const missing = driversMissingFor(b);
        outcome = { state: "unmeasured", text: missing.length ? `the backend tests for this break need the ${missing.join(", ")} driver` : "no backend tests to run" };
      } else if (!clean) {
        outcome = { state: "unmeasured", text: "bin/test-agent reported no results on clean code" };
      } else {
        let broken = null;
        let rerun;
        await guard.withBreak(be, async () => {
          const r1 = await time("backend break", () => runDeftests({ root, selectors: own, drivers: driverFlag, children, logFile }));
          if (!r1.ok) {
            return;
          }
          broken = observed([...r1.tests.keys()], r1.tests, deftestObservation);
          const failing = [...broken].filter(([id, o]) => o.status === "failed" && clean.get(id) === "passed").map(([id]) => id);
          if (failing.length) {
            const r2 = await time("backend break", () => runDeftests({ root, selectors: failing, drivers: driverFlag, children, logFile }));
            rerun = observed(failing, r2.tests, deftestObservation);
          }
        });
        if (broken === null) {
          outcome = { state: "unmeasured", text: "bin/test-agent reported no results with the break applied (it may not compile)" };
        } else {
          let j = judge({ clean, broken, rerun });
          if (j.unconfirmed.length) {
            const r3 = await time("backend clean rerun", () => runDeftests({ root, selectors: j.unconfirmed, drivers: driverFlag, children, logFile }));
            j = judge({ clean, broken, rerun, cleanRerun: observed(j.unconfirmed, r3.tests, deftestObservation) });
          }
          row.results.backend = { ...j, selectors: own };
          const prCaught = j.caught_by.filter((id) => prIds.includes(id));
          if (prCaught.length) {
            outcome = { state: "caught", by: prCaught, layer: "pr" };
          } else if (j.caught_by.length) {
            outcome = { state: "caught", by: j.caught_by, layer: "existing" };
          } else if (j.errored.length || j.unconfirmed.length) {
            const id = [...j.errored, ...j.unconfirmed][0];
            outcome = { state: "unmeasured", text: `${id} failed with ${failureWords(j.failures[id])}` };
          } else if (!j.ran.length) {
            outcome = { state: "unmeasured", text: "no backend test passed on clean code to run against" };
          } else {
            outcome = { state: "nothing", noLine: false, prHasSpecs: prIds.length > 0, backend: true };
          }
        }
      }
      const missing = driversMissingFor(b);
      if (missing.length && outcome.state !== "caught" && own.length) {
        outcome.driverNote = `tests that need the ${missing.join(", ")} driver didn't run`;
      }
      row.result = outcome;
      row.ms = (row.ms ?? 0) + (Date.now() - t);
    }
  }

  const autoResults = [];
  for (const m of autoMutants) {
    const t = Date.now();
    const res = await frontendResult(m, "auto");
    autoResults.push({ ...m, ...res, patch: unifiedDiff(root, m.file, m.changes[0].before, m.changes[0].after), ms: Date.now() - t });
  }

  const stillDirty = porcelain(root, touched);
  const markerLeft = fs.existsSync(guard.markerPath);
  uninstall();
  return {
    started_at: new Date(started).toISOString(),
    wall_ms: Date.now() - started,
    timings,
    recovered,
    pr_specs: prSpecs,
    new_test_ids: [...newTestIds],
    groups: Object.fromEntries(
      Object.entries(groups).map(([k, g]) => [k, { specs: g.specs, suite_errors: Object.fromEntries(g.suiteErrors ?? []), clean_failing: g.cleanFailing ?? [] }]),
    ),
    backend_clean_failing: backendCleanFailing,
    deftests_needing_driver: scope.unit.deftests
      .filter((d) => d.driver && !(process.env.DRIVERS || "").split(",").includes(d.driver))
      .map((d) => ({ id: d.id, driver: d.driver })),
    breaks: results,
    auto: autoResults,
    working_tree: { files: touched, clean: stillDirty.length === 0 && !markerLeft, status: stillDirty },
  };
}

// Combines the PR's deftest ids with whole test namespaces, dropping a deftest whose namespace runs whole anyway.
export function backendSelectors(prIds, namespaces) {
  const all = uniq([...prIds, ...namespaces]);
  const whole = all.filter((x) => !x.includes("/"));
  return all.filter((x) => !x.includes("/") || !whole.some((ns) => x.startsWith(`${ns}/`)));
}

export function shortTest(id) {
  if (!id.includes("::")) {
    return id;
  }
  const [spec, ...rest] = id.split("::");
  const name = path.basename(spec).replace(/\.unit\.spec\.[jt]sx?$/, "");
  const title = rest.join("::");
  return `${name} › ${title.length > 90 ? title.slice(0, 89) + "…" : title}`;
}
