import fs from "node:fs";
import path from "node:path";
import { CORPUS_OUT, DATA_DIR, MUTANTS } from "./paths.mjs";

const REG_RESULTS = path.join(DATA_DIR, "results-reg");
const E2E_RESULTS = path.join(DATA_DIR, "e2e-results.json");

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);
const uniq = (xs) => [...new Set(xs)];

const unit = readJson(path.join(MUTANTS, "unit-results.json"), {});
const regs = readJson(path.join(DATA_DIR, "regressions.json"), []);
const e2e = readJson(E2E_RESULTS, {});
const reach = fs
  .readFileSync(path.join(CORPUS_OUT, "..", "reach-counts.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
function locationsFor(issue) {
  const seen = new Map();
  for (const line of reach.filter((x) => x.issue === issue)) for (const loc of line.locations ?? []) seen.set(JSON.stringify(loc), loc);
  return [...seen.values()];
}

const kills = {};

function attachE2e(id, entry) {
  const r = e2e[id];
  if (!r) return entry;
  entry.errored = uniq([...entry.errored, ...r.errored]);
  entry.ran = uniq([...entry.ran, ...r.ran]);
  entry.e2e_runs = r.runs;
  if (r.killed_by.length) {
    entry.unconfirmed_by = uniq(r.killed_by);
    entry.confirmed = Object.fromEntries(r.killed_by.map((t) => [t, false]));
  }
  if (r.notes?.length) entry.e2e_notes = r.notes;
  return entry;
}

for (const [id, u] of Object.entries(unit)) {
  kills[id] = attachE2e(id, {
    killed_by: [...u.killed_by],
    errored: [...u.errored],
    ran: [...u.ran],
    stratum: u.stratum,
    origin: "synthetic",
    file: u.file,
    line: u.line,
    unit_result: u.unit_result,
    ...(u.typecheck === "fails" && { typecheck: "fails" }),
  });
}

const cleanTests = new Map();
for (const dir of ["coverage", "coverage-extra"]) {
  const f = path.join(DATA_DIR, dir, "per-spec.jsonl");
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      if (!cleanTests.has(r.spec)) cleanTests.set(r.spec, new Set(r.tests.map((t) => t.fullName)));
    } catch {}
  }
}
const cleanDeftests = new Set();
for (const f of fs.readdirSync(path.join(DATA_DIR, "results")).filter((f) => f.startsWith("_clean-module-"))) {
  for (const k of Object.keys(readJson(path.join(DATA_DIR, "results", f), { tests: {} }).tests)) cleanDeftests.add(k);
}

function isWitnessTest(e, testId) {
  if (!e.witness_files?.length) return false;
  if (testId.includes("::")) {
    const [spec, name] = [testId.slice(0, testId.indexOf("::")), testId.slice(testId.indexOf("::") + 2)];
    if (!e.witness_files.includes(spec)) return false;
    return !cleanTests.get(spec)?.has(name);
  }
  const ns = testId.split("/")[0];
  const nsFiles = e.witness_files.map((f) => f.replace(/^(enterprise\/backend\/)?test\//, "").replace(/\.cljc?$/, "").replace(/_/g, "-").replace(/\//g, "."));
  return nsFiles.includes(ns) && !cleanDeftests.has(testId);
}

for (const e of regs) {
  const lanes = ["fe", "clj"].map((l) => readJson(path.join(REG_RESULTS, `${e.id}.${l}.json`), null)).filter(Boolean);
  const source = e.alias_of ? regs.find((x) => x.id === e.alias_of) : e;
  const srcLanes = e.alias_of ? ["fe", "clj"].map((l) => readJson(path.join(REG_RESULTS, `${e.alias_of}.${l}.json`), null)).filter(Boolean) : lanes;
  const entry = {
    killed_by: uniq(srcLanes.flatMap((r) => r.killed_by ?? [])),
    errored: uniq(srcLanes.flatMap((r) => r.errored ?? [])),
    ran: uniq(srcLanes.flatMap((r) => r.ran ?? [])),
    stratum: e.stratum ?? source?.stratum ?? null,
    origin: e.id,
    locations: locationsFor(e.issue),
    set: e.set,
    unit_result: srcLanes.length ? (srcLanes.some((r) => r.unit_result === "killed") ? "killed" : srcLanes.some((r) => r.unit_result === "trivial") ? "trivial" : srcLanes.some((r) => r.unit_result === "errored") ? "errored" : "survived") : "not_run",
  };
  if (e.alias_of) entry.alias_of = e.alias_of;
  if (!reach.some((x) => x.issue === e.issue)) entry.locations_note = "no line for this issue in reach-counts.jsonl";
  const w = entry.ran.filter((t) => isWitnessTest(source ?? e, t));
  if (w.length) entry.witness_tests = w;
  kills[e.id] = attachE2e(e.id, entry);
}

fs.writeFileSync(path.join(CORPUS_OUT, "kills.json"), JSON.stringify(kills, null, 1) + "\n");
console.log(`${Object.keys(kills).length} mutants written to kills.json`);
