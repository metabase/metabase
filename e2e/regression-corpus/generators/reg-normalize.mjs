import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { BUGS, CORPUS_OUT, DATA_DIR, WORKTREE } from "./paths.mjs";

const OUT = path.join(DATA_DIR, "reg-patches");
const RECORDS = path.join(BUGS, "INDEX.jsonl");
fs.mkdirSync(OUT, { recursive: true });

const git = (argv, opts = {}) => {
  const r = spawnSync("git", ["-C", WORKTREE, ...argv], { encoding: "utf8", maxBuffer: 64 << 20, ...opts });
  return r;
};

const status = () => git(["status", "--porcelain"]).stdout.split("\n").filter(Boolean);
const TEST_RE = /\.unit\.spec\.|\.spec\.[jt]sx?$|^test\/|^enterprise\/backend\/test\/|__support__|\/test\//;
const CLJ_RE = /\.(clj|cljc|cljs|edn)$/;

function reset() {
  git(["checkout", "--", "."]);
  git(["clean", "-fdq", "--", "frontend", "src", "enterprise", "test"]);
  if (status().length) throw new Error(`worktree not clean:\n${status().join("\n")}`);
}

const records = new Map(
  fs
    .readFileSync(RECORDS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((r) => [r.issue, r]),
);

function capture(id, kind) {
  git(["add", "-N", "."]);
  const d = git(["diff", "HEAD", "--binary"]);
  git(["reset", "-q"]);
  if (d.status !== 0) throw new Error(d.stderr);
  const file = path.join(OUT, `${id}.${kind}.patch`);
  fs.writeFileSync(file, d.stdout);
  const files = [...d.stdout.matchAll(/^diff --git a\/(\S+) /gm)].map((m) => m[1]);
  return { file, files };
}

const entries = [];
if (status().length) throw new Error("mutants worktree must start clean");

for (const d of fs.readdirSync(path.join(CORPUS_OUT, "reconstructed"))) {
  const dir = path.join(CORPUS_OUT, "reconstructed", d);
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  if (r.status !== "live") continue;
  const id = `reg-${r.issue}`;
  const e = { id, issue: r.issue, set: "reconstructed", stratum: r.stratum, oracle: r.oracle.test_id, oracle_source: r.oracle.source, oracle_kind: r.oracle.kind };
  const witness = path.join(dir, "witness.patch");
  if (fs.existsSync(witness)) {
    const a = git(["apply", witness]);
    if (a.status !== 0) {
      e.error = `witness apply: ${a.stderr}`;
      entries.push(e);
      reset();
      continue;
    }
    const w = capture(id, "witness");
    e.witness_patch = w.file;
    e.witness_files = w.files;
    reset();
  }
  const a = git(["apply", path.join(dir, "mutant.patch")]);
  if (a.status !== 0) {
    e.error = `mutant apply: ${a.stderr}`;
    entries.push(e);
    reset();
    continue;
  }
  const m = capture(id, "mutant");
  e.mutant_patch = m.file;
  e.mutant_files = m.files;
  reset();
  entries.push(e);
}

const fresh = fs
  .readFileSync(path.join(CORPUS_OUT, "freshness.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((x) => x.status === "live");

for (const x of fresh) {
  const id = `reg-${x.issue}`;
  const rec = records.get(x.issue) ?? {};
  const e = { id, issue: x.issue, set: "freshness", stratum: rec.stratum ?? null, hint: x.hint, hint_kind: x.hint_kind, layer: x.layer, cljs_rebuild_needed: x.cljs_rebuild_needed, apply: x.apply };
  const patch = path.join(BUGS, String(x.issue), x.patch_file);
  const argv = ["apply"];
  if (/ -R /.test(x.apply_cmd)) argv.push("-R");
  if (/--3way/.test(x.apply_cmd)) argv.push("--3way");
  argv.push(patch);
  const a = git(argv);
  if (a.status !== 0 || /with conflicts/.test(a.stderr)) {
    e.error = `apply: ${a.stderr}`;
    entries.push(e);
    git(["reset", "-q"]);
    reset();
    continue;
  }
  git(["reset", "-q"]);
  const conflictMarkers = git(["diff", "HEAD"]).stdout.match(/^\+(<<<<<<<|>>>>>>>)/m);
  if (conflictMarkers) e.error = "conflict markers after apply";
  const m = capture(id, "mutant");
  e.mutant_patch = m.file;
  e.mutant_files = m.files;
  e.test_files_in_patch = m.files.filter((f) => TEST_RE.test(f));
  reset();
  entries.push(e);
}

for (const e of entries) {
  const files = e.mutant_files ?? [];
  e.lang = files.every((f) => CLJ_RE.test(f)) ? "clj" : files.some((f) => CLJ_RE.test(f)) ? "both" : "fe";
}
fs.writeFileSync(path.join(DATA_DIR, "regressions.json"), JSON.stringify(entries, null, 1) + "\n");
console.log(`${entries.length} entries, ${entries.filter((e) => e.error).length} errors`);
for (const e of entries.filter((e) => e.error)) console.log(e.id, e.error);
const counts = {};
for (const e of entries) counts[`${e.set}/${e.lang}`] = (counts[`${e.set}/${e.lang}`] ?? 0) + 1;
console.log(counts);
