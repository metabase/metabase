import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DATA_DIR } from "./paths.mjs";

const DISPATCHES = path.join(DATA_DIR, "e2e-dispatches.jsonl");
const LOGS = path.join(DATA_DIR, "e2e-logs");
const OUT = path.join(DATA_DIR, "e2e-results.json");
const REPO = "metabase/metabase";
fs.mkdirSync(LOGS, { recursive: true });

const gh = (argv) => {
  const r = spawnSync("gh", argv, { encoding: "utf8", maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`gh ${argv.join(" ")}: ${r.stderr}`);
  return r.stdout;
};

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

function cypressLines(raw, spec) {
  const lines = raw.split("\n").map((l) => {
    const parts = l.split("\t");
    const content = parts.length >= 3 ? parts.slice(2).join("\t") : l;
    return stripAnsi(content.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ""));
  });
  const base = path.basename(spec);
  const start = lines.findIndex((l) => /^\s*Running:\s+/.test(l) && l.includes(base));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /\(Run Finished\)/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end);
}

const cleanTitle = (t) => t.replace(/\s+\(\d+ms\)\s*$/, "").replace(/: burning \d+ of \d+$/, "").trim();

function parse(lines) {
  const tests = [];
  const stack = [];
  let i = 1;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\d+ passing/.test(l)) break;
    if (!l.trim()) continue;
    const indent = l.match(/^\s*/)[0].length;
    const pass = l.match(/^\s*✓\s+(.*)$/);
    const fail = l.match(/^\s*(\d+)\)\s+(.*)$/);
    const pend = l.match(/^\s*-\s+(.*)$/);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (pass || fail || pend) {
      const title = cleanTitle(pass ? pass[1] : fail ? fail[2] : pend[1]);
      tests.push({ describe: stack.map((s) => s.title), title, status: pass ? "passed" : fail ? "failed" : "pending", n: fail ? Number(fail[1]) : null });
    } else if (!/^\s*(Running:|\(|│|┌|└|─)/.test(l)) {
      stack.push({ indent, title: l.trim() });
    }
  }
  const failures = new Map();
  let cur = null;
  for (; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/^\s{2}(\d+)\)\s+(.*)$/);
    if (m) {
      cur = Number(m[1]);
      failures.set(cur, [m[2]]);
      continue;
    }
    if (/^\s*\(Results\)/.test(l)) break;
    if (cur !== null) failures.get(cur).push(l);
  }
  for (const t of tests) if (t.n !== null) t.failure = (failures.get(t.n) ?? []).join("\n").slice(0, 3000);
  return tests;
}

function classify(t) {
  const text = t.failure ?? "";
  if (/"before (each|all)" hook|"after (each|all)" hook/.test(text)) return "errored";
  if (/originated from your application code|uncaught exception/i.test(text)) return "errored";
  if (/cy\.wait\(\)` timed out|cy\.wait\(\) timed out|cy\.request\(\)|cy\.task\(/.test(text)) return "errored";
  if (/AssertionError|expected .* to |Unable to find|Expected to find|never found it|to have been called|to be (visible|called)|\+ expected - actual/i.test(text)) return "killed";
  return "errored";
}

const dispatches = fs.readFileSync(DISPATCHES, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const results = { ...prev };

for (const d of dispatches) {
  const view = JSON.parse(gh(["run", "view", String(d.run_id), "--repo", REPO, "--json", "status,conclusion,jobs,url,createdAt,updatedAt"]));
  const run = { run_id: d.run_id, url: d.url, spec: d.spec, grep: d.grep, conclusion: view.status === "completed" ? view.conclusion : view.status, started: view.createdAt, finished: view.updatedAt };
  if (view.status !== "completed") {
    results[d.id] = { runs: [run], killed_by: [], errored: [], ran: [], tests: [], pending: true };
    continue;
  }
  const job = view.jobs.find((j) => j.name.startsWith("Stress test E2E"));
  const logFile = path.join(LOGS, `${d.id}.log`);
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, gh(["run", "view", "--repo", REPO, "--job", String(job.databaseId), "--log"]));
  const lines = cypressLines(fs.readFileSync(logFile, "utf8"), d.spec);
  const failedStep = job.steps.find((s) => s.conclusion === "failure");
  run.failed_step = failedStep?.name ?? null;
  const notes = [];
  let tests = [];
  const raw = fs.readFileSync(logFile, "utf8");
  if (/Can't run because no spec files were found/.test(stripAnsi(raw))) {
    notes.push("no test ran: @cypress/grep dropped the spec because the grep text isn't a static title in the source (the describe title is built at runtime)");
  } else if (!lines) {
    notes.push(`no Cypress output for the spec; failed step: ${failedStep?.name ?? "none"}`);
  } else {
    tests = parse(lines);
  }
  const id = (t) => `${d.spec}::${[...t.describe, t.title].join(" ")}`;
  const ran = tests.filter((t) => t.status !== "pending").map(id);
  const killed = [];
  const errored = [];
  for (const t of tests.filter((t) => t.status === "failed")) {
    const kind = classify(t);
    t.kind = kind;
    (kind === "killed" ? killed : errored).push(id(t));
  }
  results[d.id] = {
    runs: [run],
    killed_by: killed,
    errored,
    ran,
    tests: tests.map((t) => ({ id: id(t), status: t.status, kind: t.kind ?? null, failure: t.failure ? t.failure.slice(0, 1200) : undefined })),
    notes,
  };
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 1) + "\n");
for (const [id, r] of Object.entries(results)) {
  console.log(`${id.padEnd(30)} ${String(r.runs[0].conclusion).padEnd(11)} ran=${r.ran.length} killed=${r.killed_by.length} errored=${r.errored.length}${r.notes?.length ? " " + r.notes.join("; ") : ""}`);
}
