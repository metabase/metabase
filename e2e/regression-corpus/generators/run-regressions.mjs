import fs from "node:fs";
import path from "node:path";
import {
  WORKTREE,
  TMP,
  sh,
  assertClean,
  loadCoverage,
  selectSpecs,
  jestResults,
  moduleFor,
  runTestAgent,
  cleanModuleBaseline,
  setSpecCap,
  innermostStatement,
  commonPrefix,
} from "./run-mutants.mjs";
import { createRequire } from "node:module";
import { parse } from "./gen-ts.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, "results-reg");
const JEST_TIMEOUT_MS = 40 * 60 * 1000;
fs.mkdirSync(OUT, { recursive: true });
setSpecCap(400);
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--max-old-space-size=12288"].filter(Boolean).join(" ");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const lane = flag("--lang");
if (!["fe", "clj"].includes(lane)) throw new Error("--lang fe|clj");
const only = flag("--only")?.split(",");
const skip = new Set((flag("--skip") ?? "").split(",").filter(Boolean));
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

const CLJ_RE = /\.(clj|cljc|cljs|edn)$/;
const inLane = (f) => (lane === "clj" ? CLJ_RE.test(f) : !CLJ_RE.test(f));

const ASSERTION_RE = /expect\(|Expected|Received|toHave|toBe|toEqual|toMatch|toContain|Unable to find|TestingLibraryElementError|AssertionError|Snapshot|toThrow|toBeCalled|toHaveBeenCalled|Found multiple elements/;
function classify(message) {
  const text = (message || "").replace(/\u001b\[[0-9;]*m/g, "");
  if (/Exceeded timeout of/.test(text)) return "timeout";
  const head = text.split("\n").slice(0, 6).join("\n");
  if (ASSERTION_RE.test(head)) return "assertion";
  const frame = text.split("\n").find((l) => /^\s+at /.test(l)) || "";
  if (/\.(unit\.)?spec\.[jt]sx?|\/test\/|__support__|\/mocks?\//.test(frame)) return "assertion";
  return "exception";
}

function patchFiles(patchText) {
  const files = [];
  for (const block of patchText.split(/^(?=diff --git )/m)) {
    const m = block.match(/^diff --git a\/(\S+) b\/(\S+)/);
    if (!m) continue;
    files.push({ file: m[2], isNew: /^new file mode/m.test(block) });
  }
  return files;
}

function changeRanges(patchText) {
  const ranges = new Map();
  for (const block of patchText.split(/^(?=diff --git )/m)) {
    const m = block.match(/^diff --git a\/(\S+) /);
    if (!m) continue;
    const file = m[1];
    const out = [];
    let old = 0;
    let removedInGroup = false;
    let insertion = null;
    const flush = () => {
      if (insertion && !removedInGroup) out.push(insertion);
      insertion = null;
      removedInGroup = false;
    };
    for (const line of block.split("\n")) {
      const h = line.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
      if (h) {
        flush();
        old = Number(h[1]);
        if (h[2] === "0") old += 1;
        continue;
      }
      if (!old) continue;
      if (line.startsWith("-") && !line.startsWith("---")) {
        out.push({ line: old, end_line: old });
        removedInGroup = true;
        old++;
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        insertion ??= { line: Math.max(1, old - 1), end_line: old };
      } else if (line.startsWith(" ")) {
        flush();
        old++;
      }
    }
    flush();
    ranges.set(file, out);
  }
  return ranges;
}

let appliedFiles = [];

function applyPatch(patch, include) {
  const argv = ["apply", ...include.map((f) => `--include=${f}`), patch];
  const r = sh("git", argv, { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (r.status !== 0) throw new Error(`git apply failed for ${patch}: ${r.stderr}`);
  const files = patchFiles(fs.readFileSync(patch, "utf8")).filter((f) => include.includes(f.file));
  appliedFiles.push(...files);
  return files;
}

function restoreFiles(files) {
  for (const { file, isNew } of files) {
    const abs = path.join(WORKTREE, file);
    if (isNew) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    const head = sh("git", ["show", `HEAD:${file}`], { encoding: "buffer" });
    if (head.status !== 0) throw new Error(`git show failed for ${file}`);
    fs.writeFileSync(abs, head.stdout);
  }
  const done = new Set(files.map((f) => f.file));
  appliedFiles = appliedFiles.filter((f) => !done.has(f.file));
}

function restoreAll() {
  restoreFiles([...appliedFiles]);
  assertClean();
}

function runJestLite(specPaths, tag) {
  const out = path.join(TMP, `${tag}.json`);
  fs.rmSync(out, { force: true });
  const r = sh(
    "bun",
    ["run", "test-unit-keep-cljs", "--ci", "--silent", "--passWithNoTests", "--reporters=summary", `--reporters=${path.join(HERE, "json-lite-reporter.cjs")}`, "--runTestsByPath", ...specPaths],
    { timeout: JEST_TIMEOUT_MS, env: { ...process.env, JSON_LITE_OUT: out } },
  );
  let json = null;
  try {
    json = JSON.parse(fs.readFileSync(out, "utf8"));
  } catch {}
  return { json, ms: r.ms, status: r.status, timedOut: r.error?.code === "ETIMEDOUT", stderrTail: (r.stderr || "").slice(-2000) };
}

const specOfJestId = (id) => id.split("::")[0];
const ts = createRequire(path.join(WORKTREE, "package.json"))("typescript");
let SPEC_LIMIT = 400;

function innermostFunction(file, line, endLine) {
  const { sf } = parse(file);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  let best = null;
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      const start = lineOf(node.getStart());
      const end = lineOf(node.getEnd());
      if (start <= line && end >= endLine && (!best || end - start < best.end - best.start)) {
        const entry = ts.isBlock(node.body) ? node.body.statements.slice(0, 3).map((st) => lineOf(st.getStart())) : [lineOf(node.body.getStart())];
        best = { start, end, entry };
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return best;
}

const TRIVIAL_LINE = /^\s*(\/\/.*|\/\*.*|\*.*|[)}\]};,]*)\s*$/;

function pickSpecs(file, r) {
  const { statements, specs } = loadCoverage();
  const stmts = statements.get(file);
  const base = selectSpecs({ file, line: r.line, end_line: r.end_line });
  if (!stmts) return base;
  const idx = innermostStatement(stmts, r.line, r.end_line);
  const stSpan = idx >= 0 ? (stmts[idx][2] ?? stmts[idx][0]) - stmts[idx][0] : Infinity;
  const fn = innermostFunction(file, r.line, r.end_line);
  if (!fn || fn.end - fn.start >= stSpan) return base;
  const entryIdx = stmts.map((st, i) => (fn.entry.includes(st[0]) && st[0] >= fn.start && st[0] <= fn.end ? i : -1)).filter((i) => i >= 0);
  if (!entryIdx.length) return base;
  const loaders = specs.filter((s) => s.files.has(file) && !s.execError);
  const reaching = loaders.filter((s) => entryIdx.some((i) => s.files.get(file).has(i)));
  const ranked = [...reaching].sort((a, b) => commonPrefix(b.spec, file) - commonPrefix(a.spec, file) || a.spec.localeCompare(b.spec));
  return { specs: ranked.slice(0, SPEC_LIMIT), reachCount: reaching.length, sampled: reaching.length > SPEC_LIMIT, how: `function at ${fn.start}-${fn.end} entered (statements ${entryIdx.join(",")})`, loaders: [] };
}

function selectFor(e, feFiles) {
  const patchText = fs.readFileSync(e.mutant_patch, "utf8");
  const ranges = changeRanges(patchText);
  const chosen = new Map();
  const how = [];
  let reach = 0;
  let sampled = false;
  const picks = [];
  for (const file of feFiles) {
    const src = fs.readFileSync(path.join(WORKTREE, file), "utf8").split("\n");
    const all = ranges.get(file) ?? [];
    const nonTrivial = all.filter((r) => r.line !== r.end_line || !TRIVIAL_LINE.test(src[r.line - 1] ?? ""));
    for (const r of nonTrivial.length ? nonTrivial : all) picks.push({ file, r, sel: pickSpecs(file, r) });
  }
  const mapped = picks.filter((p) => !p.sel.how.startsWith("no-mapped-statement") && !p.sel.how.startsWith("file-not"));
  const used = mapped.length ? mapped : picks;
  const summary = new Map();
  for (const p of used) {
    const key = `${p.file} ${p.sel.how}`;
    const prev = summary.get(key);
    summary.set(key, { lines: [...(prev?.lines ?? []), p.r.line], reach: p.sel.reachCount ?? 0 });
    reach = Math.max(reach, p.sel.reachCount ?? 0);
    sampled ||= !!p.sel.sampled;
    for (const s of p.sel.specs.length ? p.sel.specs : p.sel.loaders) chosen.set(s.spec, s);
  }
  for (const [key, v] of summary) how.push(`${key} lines=${[...new Set(v.lines)].join(",")} reach=${v.reach}`);
  if (used !== picks) how.push(`skipped ${picks.length - used.length} unmapped top-level lines`);
  const forced = new Set();
  for (const f of e.witness_files ?? []) if (/\.(unit\.)?spec\.[jt]sx?$/.test(f)) forced.add(f);
  if (e.oracle_kind === "jest" && e.oracle) forced.add(specOfJestId(e.oracle));
  for (const h of e.hint ?? []) if (/\.(unit\.)?spec\.[jt]sx?$/.test(h)) forced.add(h);
  return { chosen, forced: [...forced].filter((f) => fs.existsSync(path.join(WORKTREE, f)) || (e.witness_files ?? []).includes(f)), how, reach, sampled };
}

function runFeLane(e) {
  const started = Date.now();
  const feFiles = e.mutant_files.filter((f) => !CLJ_RE.test(f));
  const { specs: covSpecs } = loadCoverage();
  const covBySpec = new Map(covSpecs.map((s) => [s.spec, s]));
  const sel = selectFor(e, feFiles);
  const specPaths = [...new Set([...sel.chosen.keys(), ...sel.forced])];
  const result = { id: e.id, lane: "fe", spec_selection: sel.how, reach_specs: sel.reach, sampled: sel.sampled, specs_run: specPaths, forced_specs: sel.forced, runs: [] };
  if (dryRun) return result;

  const cleanStatus = new Map();
  for (const s of sel.chosen.values()) for (const [name, status] of s.tests) cleanStatus.set(`${s.spec}::${name}`, status);
  for (const spec of sel.forced) {
    const cov = covBySpec.get(spec);
    if (cov) for (const [name, status] of cov.tests) cleanStatus.set(`${spec}::${name}`, status);
  }

  try {
    const witnessSpecs = [];
    if (e.witness_patch) {
      const wFiles = patchFiles(fs.readFileSync(e.witness_patch, "utf8")).map((f) => f.file).filter(inLane);
      if (wFiles.length) {
        applyPatch(e.witness_patch, wFiles);
        witnessSpecs.push(...wFiles.filter((f) => /\.(unit\.)?spec\.[jt]sx?$/.test(f)));
        const touched = new Set(witnessSpecs);
        for (const f of wFiles) if (!touched.has(f)) for (const s of specPaths) if (path.dirname(s) === path.dirname(f) || path.dirname(s).startsWith(path.dirname(f))) touched.add(s);
        const rw = runJestLite([...touched], `${e.id}-clean-witness`);
        result.runs.push({ kind: "clean-with-witness", ms: rw.ms, specs: touched.size });
        const wt = jestResults(rw.json).tests;
        for (const id of [...cleanStatus.keys()]) if (touched.has(specOfJestId(id))) cleanStatus.delete(id);
        for (const [id, t] of wt) cleanStatus.set(id, t.status);
      }
    }

    applyPatch(e.mutant_patch, feFiles);
    const r1 = runJestLite(specPaths, `${e.id}-r1`);
    result.runs.push({ kind: "mutant", ms: r1.ms, specs: specPaths.length, timedOut: r1.timedOut });
    if (!r1.json) result.jest_stderr = r1.stderrTail;
    const { tests, suiteErrors } = jestResults(r1.json);
    result.suite_errors = Object.fromEntries(suiteErrors);
    const ran = [];
    const failedOnMutant = [];
    const errored = new Set();
    for (const [id, t] of tests) {
      if (cleanStatus.get(id) !== "passed") continue;
      ran.push(id);
      if (t.status === "failed") failedOnMutant.push(id);
    }
    for (const [spec] of suiteErrors) {
      for (const [id, status] of cleanStatus) {
        if (specOfJestId(id) !== spec || status !== "passed") continue;
        ran.push(id);
        errored.add(id);
      }
    }
    result.ran = [...new Set(ran)];

    let confirmed = [];
    if (failedOnMutant.length) {
      const failingSpecs = [...new Set(failedOnMutant.map(specOfJestId))];
      const r2 = runJestLite(failingSpecs, `${e.id}-r2`);
      result.runs.push({ kind: "mutant-rerun", ms: r2.ms, specs: failingSpecs.length });
      const again = jestResults(r2.json).tests;
      const reproduced = failedOnMutant.filter((id) => again.get(id)?.status === "failed");
      for (const id of failedOnMutant) if (!reproduced.includes(id)) errored.add(id);
      restoreFiles(appliedFiles.filter((f) => feFiles.includes(f.file)));
      if (reproduced.length) {
        const specs3 = [...new Set(reproduced.map(specOfJestId))];
        const r3 = runJestLite(specs3, `${e.id}-r3`);
        result.runs.push({ kind: "clean-rerun", ms: r3.ms, specs: specs3.length });
        const clean3 = jestResults(r3.json).tests;
        confirmed = reproduced.filter((id) => clean3.get(id)?.status === "passed");
        for (const id of reproduced) if (!confirmed.includes(id)) errored.add(id);
      }
    }
    result.failures = {};
    const killedBy = [];
    const exceptionKills = [];
    for (const id of confirmed) {
      const t = tests.get(id);
      const kind = classify(t.message ?? "");
      result.failures[id] = { kind, message: (t.message ?? "").slice(0, 600) };
      if (kind === "assertion") killedBy.push(id);
      else {
        errored.add(id);
        if (kind === "exception") exceptionKills.push(id);
      }
    }
    result.killed_by = killedBy;
    result.errored = [...errored].filter((id) => !killedBy.includes(id));
    result.exception_kills = exceptionKills;
    const allFailed = result.ran.length >= 3 && result.ran.every((id) => confirmed.includes(id) || errored.has(id));
    result.unit_result = !r1.json ? "errored" : allFailed ? "trivial" : killedBy.length ? "killed" : result.errored.length ? "errored" : "survived";
  } finally {
    restoreAll();
  }
  result.duration_ms = Date.now() - started;
  return result;
}

function runCljLane(e) {
  const started = Date.now();
  const cljFiles = e.mutant_files.filter((f) => CLJ_RE.test(f));
  const modules = [...new Set(cljFiles.map(moduleFor))];
  const result = { id: e.id, lane: "clj", modules, runs: [] };
  if (dryRun) return result;
  const clean = new Map();
  for (const m of modules) for (const [k, v] of cleanModuleBaseline(m)) clean.set(k, v);
  const extraOnly = [];
  const hints = (e.hint ?? []).filter((h) => /^metabase[\w.-]*\/[^/]+$/.test(h));
  if (e.oracle_kind === "deftest" && e.oracle) hints.push(e.oracle);
  for (const h of hints) if (!clean.has(h)) extraOnly.push(h);
  try {
    if (e.witness_patch) {
      const wFiles = patchFiles(fs.readFileSync(e.witness_patch, "utf8")).map((f) => f.file).filter(inLane);
      if (wFiles.length) {
        applyPatch(e.witness_patch, wFiles);
        const nss = wFiles.map((f) => f.replace(/^(enterprise\/backend\/)?test\//, "").replace(/\.cljc?$/, "").replace(/_/g, "-").replace(/\//g, "."));
        const rw = runTestAgent([":only", `[${nss.join(" ")}]`], `${e.id}-clean-witness`);
        result.runs.push({ kind: "clean-with-witness", ms: rw.ms, tests: rw.tests.size });
        for (const [k, v] of rw.tests) clean.set(k, v.status);
        for (let i = extraOnly.length - 1; i >= 0; i--) if (clean.has(extraOnly[i])) extraOnly.splice(i, 1);
      }
    }
    if (extraOnly.length) {
      const rc = runTestAgent([":only", `[${extraOnly.join(" ")}]`], `${e.id}-clean-hints`);
      result.runs.push({ kind: "clean-hints", ms: rc.ms, tests: rc.tests.size });
      for (const [k, v] of rc.tests) clean.set(k, v.status);
    }
    applyPatch(e.mutant_patch, cljFiles);
    const mutantTests = new Map();
    for (const m of modules) {
      const r1 = runTestAgent([":module", m], `${e.id}-r1-${m.replace(/\//g, "_")}`);
      result.runs.push({ kind: "mutant", module: m, ms: r1.ms, tests: r1.tests.size, timedOut: r1.timedOut });
      for (const [k, v] of r1.tests) mutantTests.set(k, v);
    }
    if (extraOnly.length) {
      const r1h = runTestAgent([":only", `[${extraOnly.join(" ")}]`], `${e.id}-r1-hints`);
      result.runs.push({ kind: "mutant-hints", ms: r1h.ms, tests: r1h.tests.size });
      for (const [k, v] of r1h.tests) mutantTests.set(k, v);
    }
    result.compiles = mutantTests.size > 0;
    const ran = [];
    const failed = [];
    for (const [id, t] of mutantTests) {
      if (clean.get(id) !== "passed") continue;
      ran.push(id);
      if (t.status === "failure" || t.status === "error") failed.push(id);
    }
    result.ran = ran;
    const errored = new Set();
    let confirmed = [];
    if (failed.length && failed.length < ran.length) {
      const r2 = runTestAgent([":only", `[${failed.join(" ")}]`], `${e.id}-r2`);
      result.runs.push({ kind: "mutant-rerun", ms: r2.ms, tests: r2.tests.size });
      const reproduced = failed.filter((id) => ["failure", "error"].includes(r2.tests.get(id)?.status));
      for (const id of failed) if (!reproduced.includes(id)) errored.add(id);
      restoreFiles(appliedFiles.filter((f) => cljFiles.includes(f.file)));
      if (reproduced.length) {
        const r3 = runTestAgent([":only", `[${reproduced.join(" ")}]`], `${e.id}-r3`);
        result.runs.push({ kind: "clean-rerun", ms: r3.ms, tests: r3.tests.size });
        confirmed = reproduced.filter((id) => r3.tests.get(id)?.status === "passed");
        for (const id of reproduced) if (!confirmed.includes(id)) errored.add(id);
      }
    } else if (failed.length) {
      confirmed = failed;
    }
    result.failures = Object.fromEntries(confirmed.map((id) => [id, mutantTests.get(id)]));
    result.killed_by = confirmed.filter((id) => mutantTests.get(id).status === "failure");
    for (const id of confirmed) if (mutantTests.get(id).status === "error") errored.add(id);
    result.errored = [...errored];
    result.exception_kills = confirmed.filter((id) => mutantTests.get(id).status === "error");
    const allFailed = ran.length >= 3 && failed.length === ran.length;
    result.unit_result = !result.compiles ? "errored" : allFailed ? "trivial" : result.killed_by.length ? "killed" : result.errored.length ? "errored" : "survived";
  } finally {
    restoreAll();
  }
  result.duration_ms = Date.now() - started;
  return result;
}

const entries = JSON.parse(fs.readFileSync(path.join(HERE, "regressions.json"), "utf8"))
  .filter((e) => !e.error && !skip.has(e.id))
  .filter((e) => !only || only.includes(e.id))
  .filter((e) => e.mutant_files.some(inLane))
  .sort((a, b) => (only ? only.indexOf(a.id) - only.indexOf(b.id) : 0));

if (!dryRun) assertClean();
for (const e of entries) {
  const out = path.join(OUT, `${e.id}.${lane}.json`);
  if (!dryRun && fs.existsSync(out) && !force) continue;
  const t0 = Date.now();
  let result;
  try {
    result = lane === "fe" ? runFeLane(e) : runCljLane(e);
  } catch (err) {
    try {
      restoreAll();
    } catch (err2) {
      console.error(`restore failed: ${err2}`);
      process.exit(2);
    }
    result = { id: e.id, lane, unit_result: "errored", runner_error: String(err.stack || err).slice(0, 2000), ran: [], killed_by: [], errored: [], duration_ms: Date.now() - t0 };
  }
  if (dryRun) {
    console.log(`${e.id.padEnd(10)} specs=${String(result.specs_run?.length ?? result.modules).padStart(4)} forced=${(result.forced_specs ?? []).length} reach=${result.reach_specs ?? ""} ${(result.spec_selection ?? []).join(" | ").slice(0, 300)}`);
    continue;
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(`${new Date().toISOString()} ${e.id} ${lane} ${result.unit_result} killed_by=${result.killed_by.length} ran=${result.ran.length} errored=${result.errored.length} ${(result.duration_ms / 1000).toFixed(0)}s`);
}
