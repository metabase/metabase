import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, MUTANTS } from "./paths.mjs";

const RESULTS = path.join(DATA_DIR, "results");

const metas = fs
  .readdirSync(MUTANTS)
  .filter((f) => /^syn-.*\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(MUTANTS, f), "utf8")))
  .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

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

function reclassify(m, r) {
  if (m.lang !== "fe" || !r.failures || r.unit_result === "trivial") return r;
  const confirmed = Object.keys(r.failures);
  const kinds = Object.fromEntries(confirmed.map((id) => [id, classify(r.failures[id].message)]));
  const killed = confirmed.filter((id) => kinds[id] === "assertion");
  const errored = (r.errored ?? []).filter((id) => !killed.includes(id));
  const exceptionKills = confirmed.filter((id) => kinds[id] === "exception");
  return { ...r, killed_by: killed, errored, exception_kills: exceptionKills };
}

const out = {};
const rows = [];
for (const m of metas) {
  const rf = path.join(RESULTS, `${m.id}.json`);
  if (!fs.existsSync(rf)) continue;
  const r = reclassify(m, JSON.parse(fs.readFileSync(rf, "utf8")));
  if (r.unit_result !== "trivial") {
    r.unit_result = r.killed_by.length ? "killed" : (r.exception_kills ?? []).length || (r.timeout_failures ?? []).length ? "errored" : "survived";
  }
  out[m.id] = {
    killed_by: r.killed_by ?? [],
    errored: r.errored ?? [],
    ran: r.ran ?? [],
    stratum: m.stratum,
    origin: "synthetic",
    operator: m.operator,
    typecheck: r.typecheck ?? (m.lang === "clj" ? "n/a" : "not_run"),
    compiles: r.compiles ?? null,
    unit_result: r.unit_result,
    exception_kills: r.exception_kills ?? [],
    duration_ms: r.duration_ms,
    file: m.file,
    line: m.line,
    ...(r.sampled && { specs_sampled: true }),
    ...(r.reach_specs !== undefined && { reach_specs: r.reach_specs }),
  };
  rows.push({ ...m, ...out[m.id] });
}
fs.writeFileSync(path.join(MUTANTS, "unit-results.json"), JSON.stringify(out, null, 1) + "\n");

const byOp = {};
for (const r of rows) {
  const k = `${r.stratum}/${r.operator}`;
  byOp[k] ??= { generated: 0, compiled: 0, trivial: 0, killed: 0, errored: 0, survived: 0, unreached: 0, tc_run: 0, tc_fails: 0 };
  const b = byOp[k];
  b.generated++;
  if (r.compiles !== false) b.compiled++;
  b[r.unit_result]++;
  if (r.unit_result === "survived" && (r.reach_specs ?? 1) === 0 && r.lang === "fe") b.unreached++;
  if (r.typecheck === "passes" || r.typecheck === "fails") b.tc_run++;
  if (r.typecheck === "fails") b.tc_fails++;
}
console.log(JSON.stringify(byOp, null, 1));
console.log(`results for ${rows.length} of ${metas.length} mutants`);
