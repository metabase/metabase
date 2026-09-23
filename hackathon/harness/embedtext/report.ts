// Fixed-in-advance analysis for the text strategies on northwind-sql-v1 (written before any strategy result existed).
//
//   node report.ts [--out ../research/embedding-text-results.md]
//
// Reads the dashboard's own view (harness_scenario_metric: latest run per corpus/embedder/variant/strategy), so the
// numbers match the dashboard. Statistics mirror results/src/dashboard-cards.ts exactly: paired per question,
// Δ = arm − reference, 95% CI = 1.96·sd/√n, tie = |Δ| ≤ 1e-9, verdict "better"/"worse" only when the whole CI is on
// one side of 0, "too few questions" under n = 5.
//
// Arms are (embedding_text variant, text_strategy). References: baseline/none (today) and context-sql/none
// (raw SQL in the embedding: the bar a translation must beat). HEADLINE = split-heldout only; dev is shown separately.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs, writeText } from "../corpus-gen/lib.ts";

const args = parseArgs(process.argv.slice(2));
const CORPUS = "northwind-sql-v1";
const SLICES = ["ALL", "sql-only", "mbql-only", "described", "concept", "paraphrase", "exact-name", "rare-token", "ambiguous"];
const TIE = 1e-9, MIN_N = 5;

type Row = { run_id: string; engine: string; embedder: string; embedding_text: string; text_strategy: string; scenario_id: string; tags: string[]; metric: string; value: number };
function sql<T>(q: string): T {
  const out = execFileSync("docker", ["exec", "semantic_search-postgres-1", "psql", "-U", "postgres", "-d", "harness", "-At", "-c", q], { encoding: "utf8", maxBuffer: 1 << 28 });
  return JSON.parse(out.trim() || "null") as T;
}
const rows = sql<Row[]>(`SELECT coalesce(json_agg(t), '[]') FROM (SELECT run_id, engine, embedder, embedding_text, text_strategy, scenario_id, tags, metric, value
  FROM harness_scenario_metric WHERE corpus_id = '${CORPUS}' AND metric IN ('ndcg@10', 'recall@10', 'zero_result_rate')) t`);
const runs = sql<{ run_id: string; embedder: string; embedding_text: string; text_strategy: string; indexed: number | null; finished: boolean }[]>(
  `SELECT coalesce(json_agg(t ORDER BY t.embedder, t.embedding_text, t.text_strategy), '[]') FROM (
     SELECT DISTINCT r.run_id, r.embedder, r.embedding_text, r.text_strategy,
            (r.notes::jsonb -> 'corpus' ->> 'semantic')::int AS indexed, r.finished_at IS NOT NULL AS finished
     FROM harness_run r JOIN harness_scenario_metric m USING (run_id) WHERE m.corpus_id = '${CORPUS}') t`);

const armOf = (r: { embedding_text: string; text_strategy: string }) => `${r.embedding_text}/${r.text_strategy}`;
const short = (e: string) => e.replace(/^ollama\//, "");
// value[embedder][engine][arm][metric][scenario]
const V = new Map<string, number>();
const tagsOf = new Map<string, string[]>();
for (const r of rows) {
  V.set([r.embedder, r.engine, armOf(r), r.metric, r.scenario_id].join("|"), r.value);
  tagsOf.set(r.scenario_id, r.tags);
}
const get = (emb: string, eng: string, arm: string, metric: string, sid: string) => V.get([emb, eng, arm, metric, sid].join("|"));
const embedders = [...new Set(rows.map((r) => r.embedder))].sort();
const engines = ["semantic", "semantic-vector", "semantic-pure", "in-place", "appdb"].filter((e) => rows.some((r) => r.engine === e));
const arms = [...new Set(rows.map(armOf))].sort();
const REFS = ["baseline/none", "context-sql/none"];

function inSlice(sid: string, split: string, slice: string): boolean {
  const t = tagsOf.get(sid) ?? [];
  return t.includes(`split-${split}`) && (slice === "ALL" || t.includes(slice));
}
function paired(emb: string, eng: string, arm: string, ref: string, split: string, slice: string) {
  const sids = [...tagsOf.keys()].filter((s) => inSlice(s, split, slice));
  const d: number[] = [], rA: number[] = [], rR: number[] = [], zA: number[] = [];
  let perfA = 0, perfR = 0;
  for (const s of sids) {
    const a = get(emb, eng, arm, "ndcg@10", s), b = get(emb, eng, ref, "ndcg@10", s);
    if (a === undefined || b === undefined) continue;
    d.push(a - b);
    if (a >= 1 - 1e-9) perfA++;
    if (b >= 1 - 1e-9) perfR++;
    const ra = get(emb, eng, arm, "recall@10", s), rb = get(emb, eng, ref, "recall@10", s), z = get(emb, eng, arm, "zero_result_rate", s);
    if (ra !== undefined && rb !== undefined) { rA.push(ra); rR.push(rb); }
    if (z !== undefined) zA.push(z);
  }
  const n = d.length;
  if (!n) return null;
  const mean = d.reduce((x, y) => x + y, 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0;
  const ci = 1.96 * sd / Math.sqrt(n);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : NaN);
  return {
    n, mean, ci,
    w: d.filter((x) => x > TIE).length, t: d.filter((x) => Math.abs(x) <= TIE).length, l: d.filter((x) => x < -TIE).length,
    verdict: n < MIN_N ? "too few" : mean - ci > 0 ? "BETTER" : mean + ci < 0 ? "WORSE" : "no proven diff",
    recallArm: avg(rA), recallRef: avg(rR), zero: avg(zA), perfA, perfR,
  };
}

// --select: the pre-registered rule for which strategy gets the pure-vector runs. DEV ONLY; prints no held-out number.
// Rule (written 2026-09-23 before any strategy result): among the */none strategy arms with embedding_text = baseline,
// take engine `semantic`, slice ALL, split dev; score = mean over embedders of paired Δ nDCG@10 vs baseline/none.
// Highest score wins. Ties within 0.005 go to the cheaper strategy: mech before llm, then fill-empty before fill-all.
if (args.select === "true") {
  const cost = (a: string) => (a.includes("mech") ? 0 : 2) + (a.includes("fill-empty") ? 0 : 1);
  const scored = arms.filter((a) => a.startsWith("baseline/") && a !== "baseline/none").map((arm) => {
    const ds = embedders.map((e) => paired(e, "semantic", arm, "baseline/none", "dev", "ALL")?.mean).filter((x): x is number => x !== undefined);
    return { arm, score: ds.length === embedders.length ? ds.reduce((x, y) => x + y, 0) / ds.length : NaN, embedders: ds.length };
  });
  const complete = scored.filter((s) => !Number.isNaN(s.score));
  for (const s of scored) console.log(`  dev ${s.arm}: ${Number.isNaN(s.score) ? `incomplete (${s.embedders}/${embedders.length} embedders)` : s.score.toFixed(4)}`);
  complete.sort((a, b) => (Math.abs(a.score - b.score) <= 0.005 ? cost(a.arm) - cost(b.arm) : b.score - a.score));
  console.log(complete.length === 4 ? `SELECTED for pure-vector runs: ${complete[0].arm}` : `not all 4 strategies complete yet (${complete.length}/4)`);
  process.exit(0);
}

const f = (x: number, s = false) => (Number.isNaN(x) ? "–" : `${s && x > 0 ? "+" : ""}${x.toFixed(3)}`);
const out: string[] = [
  `# Text strategies on ${CORPUS}: results`,
  "",
  `Generated by \`embedtext/report.ts\` at ${new Date().toISOString()}. The analysis was fixed before any strategy result existed.`,
  "Paired per question, Δ nDCG@10 = arm − reference, ± 95% CI = 1.96·sd/√n, W/T/L = arm wins/ties/losses.",
  "Verdict is BETTER/WORSE only when the whole CI is on one side of 0. **Headline = held-out split.**",
  "CEILING: the strategy arms put most held-out questions at a perfect nDCG of 1.0 (last column), so arms and embedders that",
  "differ per question can still share a mean (e.g. llm-fill-all 0.969 on both embedders: 17/24 questions equal, 14 of them both",
  "at 1.0, 7 different). Equal means here are a ceiling effect, not evidence that the embedder doesn't matter.",
  "ATTRIBUTION: `semantic` is hybrid (vector + keyword, RRF). Description text reaches its keyword arm, while context-sql's SQL",
  "does not (it changes only the embedding text). So \"strategy vs context-sql\" here is hybrid + description vs vector-only SQL.",
  "The vector-only comparison comes from the BL-35 `semantic-vector` runs (pending) and the supplementary replay.",
  "",
  "## Runs",
  "",
  "| embedder | variant/strategy | run | indexed (semantic) | finished |",
  "|---|---|---|---|---|",
  ...runs.map((r) => `| ${short(r.embedder)} | ${armOf(r)} | \`${r.run_id}\` | ${r.indexed ?? "?"} | ${r.finished ? "yes" : "NO"} |`),
  "",
];
for (const split of ["heldout", "dev"]) {
  out.push(`## ${split === "heldout" ? "HEADLINE: held-out questions" : "Dev questions (used while building; not the headline)"}`, "");
  for (const ref of REFS) {
    for (const emb of embedders) {
      const table: string[] = [];
      for (const arm of arms.filter((a) => a !== ref)) {
        for (const eng of engines) {
          for (const slice of SLICES) {
            const p = paired(emb, eng, arm, ref, split, slice);
            if (!p) continue;
            table.push(`| ${arm} | ${eng} | ${slice} | ${p.n} | ${p.w}/${p.t}/${p.l} | ${f(p.mean, true)} ± ${f(p.ci)} | **${p.verdict}** | ${f(p.recallRef)} → ${f(p.recallArm)} | ${f(p.zero)} | ${p.perfR} → ${p.perfA} |`);
          }
        }
      }
      if (!table.length) continue;
      out.push(`### vs ${ref}, ${short(emb)}`, "",
        "| arm | engine | slice | n | W/T/L | Δ nDCG@10 ± CI | verdict | recall@10 ref → arm | zero-result rate (arm) | questions at nDCG 1.0 ref → arm |",
        "|---|---|---|---|---|---|---|---|---|---|", ...table, "");
    }
  }
}
const text = out.join("\n") + "\n";
const path = args.out ?? join(import.meta.dirname, "../research/embedding-text-results.md");
writeText(path, text);
console.log(`wrote ${path} (${rows.length} metric rows, ${runs.length} runs, arms: ${arms.join(", ")})`);
