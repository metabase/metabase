import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import * as g from "./gen-ts.mjs";
import { DATA_DIR, HERE, MUTANTS, WORKTREE } from "./paths.mjs";

const targets = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "targets.json"), "utf8")).filter((t) => t.exists);

const TOTAL_CAP = 150;
const PER_FILE_PER_OP = 3;
const QUOTAS = {
  "remove-call": { fe: 27, clj: 7 },
  "drop-prop": { fe: 28, clj: 0 },
  "rename-key": { fe: 24, clj: 2 },
  "drop-cache-tag": { fe: 24, clj: 0 },
  "drop-refetch": { fe: 14, clj: 1 },
  "drop-persisted-field": { fe: 22, clj: 3 },
};
const BASELINE = {
  fe: ["frontend/src/metabase/app.tsx", "frontend/src/metabase/plugins/index.ts", "frontend/src/metabase/redux/auth.ts", "frontend/src/metabase/route-guards/auth-guards.tsx"],
  clj: ["src/metabase/core/core.clj", "src/metabase/server/handler.clj", "src/metabase/server/middleware/session.clj", "src/metabase/server/middleware/auth.clj"],
  pick: [
    { file: "frontend/src/metabase/app.tsx", match: "registerVisualizations();" },
    { file: "frontend/src/metabase/redux/auth.ts", match: "resetApiState" },
    { file: "frontend/src/metabase/route-guards/auth-guards.tsx", match: "replaceLocation(to)" },
    { file: "src/metabase/core/core.clj", match: "(setup/create-token!)" },
    { file: "src/metabase/core/core.clj", match: "(notification/seed-notification!)" },
  ],
};
const MAX_FROM_MIGRATIONS = 0;

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const langOf = (file) => (/\.(clj|cljc)$/.test(file) ? "clj" : "fe");

function cljCandidates(files) {
  if (!files.length) return [];
  const out = execFileSync("bb", [path.join(HERE, "gen-clj.bb"), ...files], { encoding: "utf8", maxBuffer: 64 << 20 });
  return JSON.parse(out);
}

function feCandidates(file, opts = {}) {
  const out = [];
  for (const [op, fn] of Object.entries(g.OPERATORS)) {
    try {
      out.push(...fn(file, opts));
    } catch (e) {
      console.error(`generator ${op} failed on ${file}: ${e.message}`);
    }
  }
  return out;
}

function valid(c) {
  if (c.lang !== "fe") return true;
  const text = fs.readFileSync(path.join(WORKTREE, c.file), "utf8");
  return g.syntaxErrors(c.file, g.applyEdit(text, c.edit)).length === 0;
}

function dedupe(cands) {
  const seen = new Set();
  return cands.filter((c) => {
    const k = `${c.file}|${c.edit.start}|${c.edit.end}|${c.edit.replacement}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function pickPerFile(cands) {
  const sorted = [...cands].sort((a, b) => b.priority - a.priority || a.line - b.line);
  const picked = [];
  const descs = new Set();
  const top = sorted.filter((c) => c.priority === sorted[0].priority);
  const pool = top.length >= PER_FILE_PER_OP ? top : sorted;
  const step = pool.length / PER_FILE_PER_OP;
  for (let i = 0; i < PER_FILE_PER_OP && i * step < pool.length; i++) {
    const c = pool[Math.floor(i * step)];
    const key = c.description.replace(/\s+/g, " ");
    if (descs.has(key)) continue;
    descs.add(key);
    picked.push(c);
  }
  for (const c of pool) {
    if (picked.length >= PER_FILE_PER_OP) break;
    const key = c.description.replace(/\s+/g, " ");
    if (!descs.has(key) && !picked.includes(c)) {
      descs.add(key);
      picked.push(c);
    }
  }
  return picked;
}

function roundRobin(byFile, quota, weightOf) {
  const files = [...byFile.keys()].sort(
    (a, b) =>
      weightOf(b) - weightOf(a) ||
      Math.max(...byFile.get(b).map((c) => c.priority)) - Math.max(...byFile.get(a).map((c) => c.priority)) ||
      hash(a) - hash(b),
  );
  const chosen = [];
  let migrations = 0;
  for (let round = 0; round < PER_FILE_PER_OP && chosen.length < quota; round++) {
    for (const f of files) {
      if (chosen.length >= quota) break;
      const c = byFile.get(f)[round];
      if (!c) continue;
      if (f.includes("custom_migrations")) {
        if (migrations >= MAX_FROM_MIGRATIONS) continue;
        migrations++;
      }
      chosen.push(c);
    }
  }
  return chosen;
}

const weight = new Map(targets.map((t) => [t.file, t.freq]));
const all = [];

for (const t of targets.filter((t) => t.lang === "fe")) {
  for (const c of feCandidates(t.file)) all.push({ ...c, lang: "fe", stratum: c.stratum });
}

const index = g.apiEndpointIndex();
const reached = new Map();
for (const t of targets.filter((t) => t.lang === "fe")) {
  for (const ep of g.endpointsUsedBy(t.file)) {
    const f = index.get(ep);
    if (!f) continue;
    if (!reached.has(f)) reached.set(f, { endpoints: new Set(), via: new Set() });
    reached.get(f).endpoints.add(ep);
    reached.get(f).via.add(t.file);
  }
}
for (const [f, { endpoints, via }] of reached) {
  const w = [...via].reduce((s, v) => s + (weight.get(v) || 0), 0);
  weight.set(f, Math.max(weight.get(f) || 0, w));
  for (const op of ["drop-cache-tag", "rename-key", "drop-persisted-field"]) {
    for (const c of g.OPERATORS[op](f, { endpointNames: endpoints })) {
      const via_ = c.endpoint ? [...via].filter((v) => g.endpointsUsedBy(v).has(c.endpoint)) : [...via];
      all.push({ ...c, lang: "fe", reached_via: via_ });
    }
  }
}

for (const c of cljCandidates(targets.filter((t) => t.lang === "clj").map((t) => t.file))) all.push({ ...c, lang: "clj" });

const baselineCands = [];
for (const f of BASELINE.fe.filter((f) => fs.existsSync(path.join(WORKTREE, f)))) {
  for (const c of feCandidates(f)) baselineCands.push({ ...c, lang: "fe", stratum: "baseline" });
}
for (const c of cljCandidates(BASELINE.clj.filter((f) => fs.existsSync(path.join(WORKTREE, f))))) {
  baselineCands.push({ ...c, lang: "clj", stratum: "baseline" });
}

const validAll = dedupe(all).filter(valid);
const validBaseline = dedupe(baselineCands).filter(valid);
console.log(`candidates: ${all.length} (${validAll.length} valid), baseline ${baselineCands.length} (${validBaseline.length} valid)`);

const selected = [];
const generatedCounts = {};
for (const [op, quota] of Object.entries(QUOTAS)) {
  for (const lang of ["fe", "clj"]) {
    const pool = validAll.filter((c) => c.operator === op && c.lang === lang);
    generatedCounts[`${op}/${lang}`] = pool.length;
    const byFile = new Map();
    for (const c of pool) {
      if (!byFile.has(c.file)) byFile.set(c.file, []);
      byFile.get(c.file).push(c);
    }
    for (const [f, cs] of byFile) byFile.set(f, pickPerFile(cs));
    selected.push(...roundRobin(byFile, quota[lang], (f) => weight.get(f) || 0));
  }
}
for (const { file, match } of BASELINE.pick) {
  const c = validBaseline.find((c) => c.file === file && c.description.includes(match));
  if (c) selected.push(c);
  else console.error(`baseline pick not found: ${file} ${match}`);
}

const final = selected.slice(0, TOTAL_CAP);
fs.mkdirSync(MUTANTS, { recursive: true });
for (const f of fs.readdirSync(MUTANTS)) if (/^syn-.*\.(patch|json)$/.test(f)) fs.rmSync(path.join(MUTANTS, f));

const counters = {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mutant-"));
const manifest = [];
for (const c of final) {
  const key = `${c.stratum}-${c.operator}`;
  counters[key] = (counters[key] || 0) + 1;
  const id = `syn-${key}-${counters[key]}`;
  const original = fs.readFileSync(path.join(WORKTREE, c.file), "utf8");
  const mutated = g.applyEdit(original, c.edit);
  const a = path.join(tmp, "a");
  const b = path.join(tmp, "b");
  fs.writeFileSync(a, original);
  fs.writeFileSync(b, mutated);
  const diff = spawnSync("diff", ["-u", "--label", `a/${c.file}`, "--label", `b/${c.file}`, a, b], { encoding: "utf8" }).stdout;
  fs.writeFileSync(path.join(MUTANTS, `${id}.patch`), `diff --git a/${c.file} b/${c.file}\n${diff}`);
  const meta = {
    id,
    stratum: c.stratum,
    operator: c.operator,
    file: c.file,
    line: c.line,
    end_line: c.end_line,
    description: c.description,
    lang: c.lang,
    corpus_weight: weight.get(c.file) || 0,
    ...(c.reached_via && { reached_via: c.reached_via }),
  };
  fs.writeFileSync(path.join(MUTANTS, `${id}.json`), JSON.stringify(meta, null, 2) + "\n");
  manifest.push(meta);
}
fs.writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(DATA_DIR, "generated-counts.json"), JSON.stringify(generatedCounts, null, 1));
const tally = {};
for (const m of manifest) tally[`${m.stratum}/${m.operator}/${m.lang}`] = (tally[`${m.stratum}/${m.operator}/${m.lang}`] || 0) + 1;
console.log(`selected ${manifest.length}`, tally);
