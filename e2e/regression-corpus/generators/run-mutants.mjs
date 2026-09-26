import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parse } from "./gen-ts.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKTREE = "/private/tmp/metabase-corpus-mutants";
const MUTANTS = path.join(HERE, "..", "mutants");
const RESULTS = path.join(HERE, "results");
const COVERAGE = path.join(HERE, "coverage");
const COVERAGE_EXTRA = path.join(HERE, "coverage-extra");
const TMP = path.join(HERE, "tmp");
let SPEC_CAP = 120;
export const setSpecCap = (n) => {
  SPEC_CAP = n;
};
const JEST_TIMEOUT_MS = 25 * 60 * 1000;
const TSC_BASELINE = path.join(HERE, "tsc-baseline.txt");

fs.mkdirSync(RESULTS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag("--only")?.split(",");
const lang = flag("--lang");
const typecheckIds = new Set((flag("--typecheck") ?? "").split(",").filter(Boolean));
const force = args.includes("--force");
const typecheckAll = args.includes("--typecheck-all");

function sh(cmd, argv, opts = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, argv, { cwd: WORKTREE, encoding: "utf8", maxBuffer: 256 << 20, ...opts });
  return { ...r, ms: Date.now() - started };
}

const CLJ_RE = /\.(clj|cljc|cljs|edn)$/;
const ownLang = lang === "clj" ? (f) => CLJ_RE.test(f) : lang === "fe" ? (f) => !CLJ_RE.test(f) : () => true;

function changedFiles() {
  const s = sh("git", ["status", "--porcelain"], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (s.status !== 0) throw new Error(`git status failed: ${s.stderr}`);
  return s.stdout.split("\n").filter(Boolean).map((l) => l.slice(3));
}

function assertClean() {
  const changed = changedFiles();
  const own = changed.filter(ownLang);
  if (own.length) throw new Error(`worktree not clean for this runner:\n${changed.join("\n")}`);
}

let applied = null;

function restore() {
  if (applied) {
    const head = sh("git", ["show", `HEAD:${applied}`], { encoding: "buffer" });
    if (head.status !== 0) throw new Error(`git show failed for ${applied}`);
    fs.writeFileSync(path.join(WORKTREE, applied), head.stdout);
    applied = null;
  }
  assertClean();
}

function apply(patch) {
  const file = fs.readFileSync(patch, "utf8").match(/^diff --git a\/(\S+) /)[1];
  const r = sh("git", ["apply", patch], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
  if (r.status !== 0) throw new Error(`git apply failed for ${patch}: ${r.stderr}`);
  applied = file;
}

let coverage;
function loadCoverage() {
  if (coverage) return coverage;
  const statements = new Map();
  const bySpec = new Map();
  for (const dir of [COVERAGE, COVERAGE_EXTRA]) {
    const stmtFile = path.join(dir, "per-spec.statements.jsonl");
    const specFile = path.join(dir, "per-spec.jsonl");
    if (!fs.existsSync(stmtFile) || !fs.existsSync(specFile)) continue;
    for (const line of fs.readFileSync(stmtFile, "utf8").split("\n")) {
      if (!line) continue;
      const r = JSON.parse(line);
      if (!statements.has(r.file)) statements.set(r.file, r.statements);
    }
    for (const line of fs.readFileSync(specFile, "utf8").split("\n")) {
      if (!line) continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      const files = new Map(Object.entries(r.files).map(([f, hits]) => [f, new Set(hits)]));
      const prev = bySpec.get(r.spec);
      if (prev) {
        for (const [f, hits] of files) if (!prev.files.has(f)) prev.files.set(f, hits);
        continue;
      }
      bySpec.set(r.spec, {
        spec: r.spec,
        execError: r.execError,
        tests: new Map(r.tests.map((t) => [t.fullName, t.status])),
        files,
      });
    }
  }
  coverage = { statements, specs: [...bySpec.values()] };
  return coverage;
}

function innermostStatement(stmts, line, endLine) {
  let best = -1;
  let bestSpan = Infinity;
  stmts.forEach(([sl, , el], i) => {
    const e = el ?? sl;
    if (sl <= line && e >= endLine) {
      const span = e - sl;
      if (span < bestSpan || (span === bestSpan && sl > stmts[best][0])) {
        best = i;
        bestSpan = span;
      }
    }
  });
  return best;
}

const ts = createRequire(path.join(WORKTREE, "package.json"))("typescript");

function enclosingFunctionEntryLines(file, line, endLine) {
  const { sf } = parse(file);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const fns = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body && lineOf(node.getStart()) <= line && lineOf(node.getEnd()) >= endLine) fns.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return fns.reverse().map((fn) =>
    ts.isBlock(fn.body) ? fn.body.statements.slice(0, 3).map((st) => lineOf(st.getStart())) : [lineOf(fn.body.getStart())],
  );
}

const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i;
};

function selectSpecs(meta) {
  const { statements, specs } = loadCoverage();
  const stmts = statements.get(meta.file);
  if (!stmts) return { specs: [], how: "file-not-instrumented-or-never-loaded", loaders: [] };
  const idx = innermostStatement(stmts, meta.line, meta.end_line ?? meta.line);
  const loaders = specs.filter((s) => s.files.has(meta.file) && !s.execError);
  let reaching = loaders;
  let how = "no-mapped-statement: every spec that loads the file";
  const sameLine = stmts.map((st, i) => (st[0] === meta.line ? i : -1)).filter((i) => i >= 0).sort((a, b) => stmts[a][1] - stmts[b][1]);
  if (idx >= 0) {
    reaching = loaders.filter((s) => s.files.get(meta.file).has(idx));
    how = `statement ${idx} [${stmts[idx].slice(0, 3).join(",")}]`;
  } else if (sameLine.length) {
    reaching = loaders.filter((s) => s.files.get(meta.file).has(sameLine[0]));
    how = `statement ${sameLine[0]} starting on the mutated line`;
  } else {
    for (const entryLines of enclosingFunctionEntryLines(meta.file, meta.line, meta.end_line ?? meta.line)) {
      const entryIdx = stmts.map((st, i) => (entryLines.includes(st[0]) ? i : -1)).filter((i) => i >= 0);
      if (!entryIdx.length) continue;
      reaching = loaders.filter((s) => entryIdx.some((i) => s.files.get(meta.file).has(i)));
      how = `enclosing function entered (statements ${entryIdx.join(",")} at lines ${entryLines.join(",")})`;
      break;
    }
  }
  const ranked = [...reaching].sort((a, b) => commonPrefix(b.spec, meta.file) - commonPrefix(a.spec, meta.file) || a.spec.localeCompare(b.spec));
  return {
    specs: ranked.slice(0, SPEC_CAP),
    reachCount: reaching.length,
    sampled: reaching.length > SPEC_CAP,
    how,
    loaders: [...loaders].sort((a, b) => commonPrefix(b.spec, meta.file) - commonPrefix(a.spec, meta.file)).slice(0, 3),
  };
}

function runJest(specPaths, tag) {
  const out = path.join(TMP, `${tag}.json`);
  fs.rmSync(out, { force: true });
  const r = sh(
    "bun",
    ["run", "test-unit-keep-cljs", "--ci", "--silent", "--passWithNoTests", "--reporters=summary", "--json", `--outputFile=${out}`, "--runTestsByPath", ...specPaths],
    { timeout: JEST_TIMEOUT_MS },
  );
  let json = null;
  try {
    json = JSON.parse(fs.readFileSync(out, "utf8"));
  } catch {}
  return { json, ms: r.ms, status: r.status, timedOut: r.error?.code === "ETIMEDOUT", stderrTail: (r.stderr || "").slice(-2000) };
}

const ASSERTION_RE = /expect\(|Expected|Received|toHave|toBe|toEqual|toMatch|toContain|Unable to find|TestingLibraryElementError|AssertionError|Snapshot|toThrow|toBeCalled|toHaveBeenCalled|Found multiple elements/;

function classifyFailure(messages) {
  const text = (messages || []).join("\n");
  if (/Exceeded timeout of/.test(text)) return "timeout";
  const firstLine = text.split("\n").find((l) => l.trim()) || "";
  if (ASSERTION_RE.test(firstLine) || /^\s*(Error: )?expect/.test(firstLine)) return "assertion";
  if (ASSERTION_RE.test(text.split("\n").slice(0, 6).join("\n"))) return "assertion";
  const frame = text.split("\n").find((l) => /^\s+at /.test(l)) || "";
  if (/\.(unit\.)?spec\.[jt]sx?|\/test\/|__support__|\/mocks?\//.test(frame)) return "assertion";
  return "exception";
}

function jestResults(json) {
  const tests = new Map();
  const suiteErrors = new Map();
  if (!json) return { tests, suiteErrors };
  for (const suite of json.testResults) {
    const spec = path.relative(WORKTREE, suite.name);
    if (suite.assertionResults.length === 0 && suite.status === "failed") {
      suiteErrors.set(spec, (suite.message || "").slice(0, 1500));
    }
    for (const a of suite.assertionResults) {
      tests.set(`${spec}::${a.fullName}`, {
        spec,
        fullName: a.fullName,
        status: a.status,
        kind: a.status === "failed" ? classifyFailure(a.failureMessages) : null,
        message: a.status === "failed" ? (a.failureMessages || []).join("\n").slice(0, 600) : null,
      });
    }
  }
  return { tests, suiteErrors };
}

function tscErrors() {
  const r = sh("./node_modules/typescript7/bin/tsc", ["--noEmit"], { timeout: 20 * 60 * 1000 });
  return { ms: r.ms, lines: r.stdout.split("\n").filter((l) => /error TS\d+/.test(l)) };
}

function typecheck() {
  if (!fs.existsSync(TSC_BASELINE)) throw new Error("run with --tsc-baseline first on clean tree");
  const baseline = new Set(fs.readFileSync(TSC_BASELINE, "utf8").split("\n").filter(Boolean));
  const { ms, lines } = tscErrors();
  const fresh = lines.filter((l) => !baseline.has(l));
  return { typecheck: fresh.length ? "fails" : "passes", typecheck_errors: fresh.slice(0, 5), typecheck_ms: ms };
}

function runFe(meta, patch) {
  const started = Date.now();
  const sel = selectSpecs(meta);
  const cleanStatus = new Map();
  const { specs: covSpecs } = loadCoverage();
  const covBySpec = new Map(covSpecs.map((s) => [s.spec, s]));
  const runSpecs = sel.specs.length ? sel.specs : sel.loaders;
  for (const s of runSpecs) for (const [name, status] of s.tests) cleanStatus.set(`${s.spec}::${name}`, status);

  apply(patch);
  const result = {
    id: meta.id,
    spec_selection: sel.how,
    reach_specs: sel.reachCount ?? 0,
    specs_run: runSpecs.map((s) => s.spec),
    sampled: !!sel.sampled,
    runs: [],
  };
  try {
    if (!runSpecs.length) {
      result.compiles = null;
      result.compile_check = "no spec loads this file";
    } else {
      const r1 = runJest(runSpecs.map((s) => s.spec), `${meta.id}-r1`);
      result.runs.push({ kind: "mutant", ms: r1.ms, specs: runSpecs.length, timedOut: r1.timedOut });
      const { tests, suiteErrors } = jestResults(r1.json);
      if (!r1.json) result.jest_stderr = r1.stderrTail;
      const fileBase = path.basename(meta.file).replace(/\.[jt]sx?$/, "");
      const loadFailures = [...suiteErrors.values()].filter((m) => /SyntaxError|Syntax Error|Unexpected token|Expected .* got|Transform|x Expected|×/.test(m) && m.includes(fileBase));
      result.compiles = r1.json ? loadFailures.length === 0 : null;
      result.compile_check = "jest";
      result.suite_errors = Object.fromEntries(suiteErrors);

      const ran = [];
      const failedOnMutant = [];
      const errored = new Set();
      for (const [id, t] of tests) {
        const clean = cleanStatus.get(id);
        if (clean !== "passed") continue;
        ran.push(id);
        if (t.status === "failed") failedOnMutant.push(id);
      }
      for (const [spec] of suiteErrors) {
        const cov = covBySpec.get(spec);
        if (!cov) continue;
        for (const [name, status] of cov.tests) {
          if (status !== "passed") continue;
          const id = `${spec}::${name}`;
          ran.push(id);
          errored.add(id);
        }
      }
      result.ran = [...new Set(ran)];

      let confirmed = [];
      if (failedOnMutant.length) {
        const failingSpecs = [...new Set(failedOnMutant.map((id) => tests.get(id).spec))];
        const r2 = runJest(failingSpecs, `${meta.id}-r2`);
        result.runs.push({ kind: "mutant-rerun", ms: r2.ms, specs: failingSpecs.length });
        const again = jestResults(r2.json).tests;
        const reproduced = failedOnMutant.filter((id) => again.get(id)?.status === "failed");
        for (const id of failedOnMutant) if (!reproduced.includes(id)) errored.add(id);
        restore();
        if (reproduced.length) {
          const specs3 = [...new Set(reproduced.map((id) => tests.get(id).spec))];
          const r3 = runJest(specs3, `${meta.id}-r3`);
          result.runs.push({ kind: "clean-rerun", ms: r3.ms, specs: specs3.length });
          const clean3 = jestResults(r3.json).tests;
          confirmed = reproduced.filter((id) => clean3.get(id)?.status === "passed");
          for (const id of reproduced) if (!confirmed.includes(id)) errored.add(id);
        }
      }
      const killedBy = [];
      result.failures = {};
      for (const id of confirmed) {
        const t = tests.get(id);
        result.failures[id] = { kind: t.kind, message: t.message };
        if (t.kind === "assertion") killedBy.push(id);
        else errored.add(id);
      }
      result.killed_by = killedBy;
      result.errored = [...errored];
      result.exception_kills = confirmed.filter((id) => tests.get(id).kind === "exception");
      result.timeout_failures = confirmed.filter((id) => tests.get(id).kind === "timeout");
      const allFailed = result.ran.length >= 3 && result.ran.every((id) => confirmed.includes(id) || errored.has(id));
      result.unit_result = allFailed ? "trivial" : killedBy.length ? "killed" : result.errored.length ? "errored" : "survived";
    }
    if (typecheckAll || typecheckIds.has(meta.id)) {
      if (!applied) apply(patch);
      Object.assign(result, typecheck());
    } else {
      result.typecheck = "not_run";
    }
  } finally {
    restore();
  }
  if (result.unit_result === undefined) result.unit_result = "survived";
  result.ran ??= [];
  result.killed_by ??= [];
  result.errored ??= [];
  result.duration_ms = Date.now() - started;
  return result;
}

function moduleFor(file) {
  const prefixes = JSON.parse(fs.readFileSync(path.join(HERE, "module-prefixes.json"), "utf8"));
  const ns = file.replace(/^src\//, "").replace(/\.cljc?$/, "").replace(/_/g, "-").replace(/\//g, ".");
  let best = null;
  for (const [module, prefix] of Object.entries(prefixes)) {
    if (module.startsWith("enterprise/")) continue;
    if ((ns === prefix || ns.startsWith(prefix + ".")) && (!best || prefix.length > prefixes[best].length)) best = module;
  }
  return best;
}

const decodeXml = (v) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function parseJunit(dir) {
  const tests = new Map();
  if (!fs.existsSync(dir)) return tests;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".xml")) continue;
    const xml = fs.readFileSync(path.join(dir, f), "utf8");
    const re = /<testcase\b((?:\s+[\w:-]+="[^"]*")*)\s*(\/>|>([\s\S]*?)<\/testcase>)/g;
    let m;
    while ((m = re.exec(xml))) {
      const attrs = Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], decodeXml(a[2])]));
      const body = m[3] || "";
      const status = /<failure\b/.test(body) ? "failure" : /<error\b/.test(body) ? "error" : /<skipped\b/.test(body) ? "skipped" : "passed";
      const id = `${attrs.classname}/${attrs.name}`;
      const msg = decodeXml((body.match(/message="([^"]*)"/) || [])[1] || body.replace(/<[^>]+>/g, " ")).slice(0, 400);
      tests.set(id, { status, message: msg });
    }
  }
  return tests;
}

function runTestAgent(argv, tag) {
  const junit = path.join(WORKTREE, "target", "junit");
  fs.rmSync(junit, { recursive: true, force: true });
  const log = path.join(TMP, `${tag}.log`);
  const r = sh("./bin/test-agent", argv, { timeout: 90 * 60 * 1000 });
  fs.writeFileSync(log, (r.stdout || "") + (r.stderr || ""));
  const tests = parseJunit(junit);
  return { tests, ms: r.ms, status: r.status, timedOut: r.error?.code === "ETIMEDOUT", log };
}

function cleanModuleBaseline(module) {
  const f = path.join(RESULTS, `_clean-module-${module}.json`);
  if (fs.existsSync(f)) return new Map(Object.entries(JSON.parse(fs.readFileSync(f, "utf8")).tests));
  assertClean();
  const r = runTestAgent([":module", module], `clean-${module}`);
  fs.writeFileSync(f, JSON.stringify({ module, ms: r.ms, status: r.status, tests: Object.fromEntries([...r.tests].map(([k, v]) => [k, v.status])) }, null, 1));
  return new Map([...r.tests].map(([k, v]) => [k, v.status]));
}

function runClj(meta, patch) {
  const started = Date.now();
  const module = moduleFor(meta.file);
  const clean = cleanModuleBaseline(module);
  apply(patch);
  const result = { id: meta.id, module, runs: [] };
  try {
    const r1 = runTestAgent([":module", module], `${meta.id}-r1`);
    result.runs.push({ kind: "mutant", ms: r1.ms, tests: r1.tests.size, timedOut: r1.timedOut });
    result.compiles = r1.tests.size > 0;
    const ran = [];
    const failed = [];
    for (const [id, t] of r1.tests) {
      if (clean.get(id) !== "passed") continue;
      ran.push(id);
      if (t.status === "failure" || t.status === "error") failed.push(id);
    }
    result.ran = ran;
    const errored = new Set();
    let confirmed = [];
    if (failed.length && failed.length < ran.length) {
      const only = `[${failed.join(" ")}]`;
      const r2 = runTestAgent([":only", only], `${meta.id}-r2`);
      result.runs.push({ kind: "mutant-rerun", ms: r2.ms, tests: r2.tests.size });
      const reproduced = failed.filter((id) => ["failure", "error"].includes(r2.tests.get(id)?.status));
      for (const id of failed) if (!reproduced.includes(id)) errored.add(id);
      restore();
      if (reproduced.length) {
        const r3 = runTestAgent([":only", `[${reproduced.join(" ")}]`], `${meta.id}-r3`);
        result.runs.push({ kind: "clean-rerun", ms: r3.ms, tests: r3.tests.size });
        confirmed = reproduced.filter((id) => r3.tests.get(id)?.status === "passed");
        for (const id of reproduced) if (!confirmed.includes(id)) errored.add(id);
      }
    } else if (failed.length) {
      confirmed = failed;
    }
    result.failures = Object.fromEntries(confirmed.map((id) => [id, r1.tests.get(id)]));
    result.killed_by = confirmed.filter((id) => r1.tests.get(id).status === "failure");
    for (const id of confirmed) if (r1.tests.get(id).status === "error") errored.add(id);
    result.errored = [...errored];
    result.exception_kills = confirmed.filter((id) => r1.tests.get(id).status === "error");
    const allFailed = ran.length >= 3 && failed.length === ran.length;
    result.unit_result = !result.compiles ? "errored" : allFailed ? "trivial" : result.killed_by.length ? "killed" : result.errored.length ? "errored" : "survived";
    result.typecheck = "n/a";
  } finally {
    restore();
  }
  result.duration_ms = Date.now() - started;
  return result;
}

export { WORKTREE, RESULTS, TMP, sh, changedFiles, assertClean, loadCoverage, selectSpecs, innermostStatement, commonPrefix, runJest, classifyFailure, jestResults, moduleFor, runTestAgent, cleanModuleBaseline };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (args.includes("--tsc-baseline")) {
    assertClean();
    const { ms, lines } = tscErrors();
    fs.writeFileSync(TSC_BASELINE, lines.join("\n") + "\n");
    console.log(`tsc baseline: ${lines.length} errors in ${ms}ms`);
    process.exit(0);
  }

  const metas = fs
    .readdirSync(MUTANTS)
    .filter((f) => /^syn-.*\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MUTANTS, f), "utf8")))
    .filter((m) => !only || only.includes(m.id))
    .filter((m) => !lang || m.lang === lang)
    .sort((a, b) => (only ? only.indexOf(a.id) - only.indexOf(b.id) : a.id.localeCompare(b.id, undefined, { numeric: true })));

  if (args.includes("--dry-run")) {
    for (const meta of metas.filter((m) => m.lang === "fe")) {
      const sel = selectSpecs(meta);
      console.log(`${meta.id.padEnd(36)} reach=${String(sel.reachCount ?? 0).padStart(4)} run=${String(sel.specs.length).padStart(3)} loaders=${sel.loaders.length} ${sel.how}`);
    }
    process.exit(0);
  }

  assertClean();
  for (const meta of metas) {
    const out = path.join(RESULTS, `${meta.id}.json`);
    if (fs.existsSync(out) && !force) continue;
    const patch = path.join(MUTANTS, `${meta.id}.patch`);
    const t0 = Date.now();
    let result;
    try {
      result = meta.lang === "clj" ? runClj(meta, patch) : runFe(meta, patch);
    } catch (e) {
      restore();
      result = { id: meta.id, unit_result: "errored", runner_error: String(e.stack || e).slice(0, 2000), ran: [], killed_by: [], errored: [], duration_ms: Date.now() - t0 };
    }
    fs.writeFileSync(out, JSON.stringify(result, null, 1));
    console.log(`${new Date().toISOString()} ${meta.id} ${result.unit_result} killed_by=${result.killed_by.length} ran=${result.ran.length} ${(result.duration_ms / 1000).toFixed(0)}s`);
  }
}
