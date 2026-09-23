// SUPPLEMENTARY, vector-only replay (no permissions, no scorers, no cosine cutoff, no keyword arm, no appdb top-up).
// Not the harness and never the headline: an interim check of how much of a text strategy's effect is the embedding
// itself, because pgvector `semantic` is always hybrid (index.clj:902-916, vector + keyword under RRF).
//
//   node replay.ts [--context-db <mb_pl_… pgvector db of a kept context-sql instance> --context-manifest <its manifest.json>]
//                  [--models all-minilm,snowflake-arctic-embed2,snowflake-arctic-embed2+qprefix] [--out …]
//
// Texts: the exact baseline embeddable text (embeddable.ts: 235/235 byte-identical to a live golden index) for the arms
// none / mech-* / llm-* (from artifacts/sql-text), and the alias-blind versions (artifacts/sql-aliasblind[-text]).
// context-sql text is read verbatim from a live context-sql index (--context-db); its alias-blind version swaps only
// the "sql: " line for the alias-blind SQL cut to 1000 chars (ingestion.clj embedding-sql-max-length).
// MECHANISM PROBE (not a strategy): context-sql with the SQL cut before the first FROM, i.e. just the SELECT list.
// Queries go unprefixed, as Metabase sends them for these model names (embedding.clj:697-698, BL-33), except the
// "+qprefix" label, which adds arctic-v2's "query: " to measure that bug.
// Labels, split and statistics as report.ts: C's ndcgAtK/recallAtK, paired Δ, 1.96·sd/√n, held-out first.
// Caveat: the live index also holds ~15 instance items (personal collections, …) that are not in the corpus.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type AuthoredScenarioFile, type Corpus, type Manifest, fail, parseArgs, readJson, writeText } from "../corpus-gen/lib.ts";
import { ndcgAtK, recallAtK } from "../metrics/src/metrics.ts";
import { embeddableTexts } from "./embeddable.ts";

const args = parseArgs(process.argv.slice(2));
const HERE = import.meta.dirname;
const models = (args.models ?? "all-minilm,snowflake-arctic-embed2,snowflake-arctic-embed2+qprefix").split(",");
const ollamaModel = (label: string) => label.replace(/\+qprefix$/, "");
const queryPrefix = (label: string) => (label.endsWith("+qprefix") ? "query: " : "");
const ollama = (args.ollama ?? "http://localhost:11434").replace(/\/$/, "");
const SLICES = ["ALL", "sql-only", "mbql-only", "described", "concept", "paraphrase", "exact-name", "rare-token", "ambiguous"];
const SQL_MAX = 1000;

// ------------------------------------------------------------------------------------------------ arms
const orig = readJson<Corpus>(join(HERE, "../artifacts/sql/corpus.json"));
const blind = readJson<Corpus>(join(HERE, "../artifacts/sql-aliasblind/corpus.json"));
const keys = [...embeddableTexts(orig).keys()];
const arms = new Map<string, Map<string, string>>([["none", embeddableTexts(orig)]]);
const addDerived = (dir: string, prefix: string) => {
  if (!existsSync(dir)) return;
  for (const d of readdirSync(dir).sort()) arms.set(`${prefix}${d}`, embeddableTexts(readJson<Corpus>(join(dir, d, "corpus.json"))));
};
addDerived(join(HERE, "../artifacts/sql-text"), "");
addDerived(join(HERE, "../artifacts/sql-aliasblind-text"), "blind:");

if (args["context-db"]) {
  const manifest = readJson<Manifest>(args["context-manifest"] ?? fail("--context-manifest is required with --context-db"));
  const byId = new Map(Object.entries(manifest.entities).map(([k, v]) => [`${v.model}:${v.id}`, k]));
  const db = args["context-db"];
  const psql = (q: string) => execFileSync("docker", ["exec", "semantic_search-postgres-1", "psql", "-U", "postgres", "-d", db, "-At", "-c", q], { encoding: "utf8", maxBuffer: 1 << 26 }).trim();
  const table = psql("select tablename from pg_tables where tablename like 'index_ollama%' and tablename !~ '_[0-9]+$' limit 1");
  const live = JSON.parse(psql(`select json_agg(json_build_object('m', model, 'id', model_id, 'c', content)) from ${table}`)) as { m: string; id: string; c: string }[];
  const ctx = new Map<string, string>();
  for (const r of live) { const k = byId.get(`${r.m}:${r.id}`); if (k) ctx.set(k, r.c); }
  const missing = keys.filter((k) => !ctx.has(k));
  if (missing.length) fail(`context-sql index lacks ${missing.length} corpus items: ${missing.slice(0, 5).join(", ")}`);
  arms.set("context-sql", ctx);
  // Alias-blind: swap only the sql line (the last line block, "sql: …" to the end) for the blind SQL, cut as ingestion cuts.
  const blindSqlOf = new Map(blind.entities.filter((e) => e.sql !== undefined).map((e) => [e.key, e.sql!.trim()]));
  const swapSql = (t: string, sql: string) => t.replace(/\nsql: [\s\S]*$/, `\nsql: ${sql.slice(0, SQL_MAX).trim()}`);
  arms.set("blind:context-sql", new Map([...ctx].map(([k, t]) => [k, blindSqlOf.has(k) ? swapSql(t, blindSqlOf.get(k)!) : t])));
  // Mechanism probe: keep only the SELECT list (cut at the first FROM).
  arms.set("probe:context-sql-select-only", new Map([...ctx].map(([k, t]) => [k, t.replace(/(\nsql: [\s\S]*?)\bfrom\b[\s\S]*$/i, "$1").trimEnd()])));
}
const scen = readJson<AuthoredScenarioFile>(join(HERE, "../scenarios/src/sql.json")).scenarios;
const item = (key: string) => ({ model: key.split("/")[0], id: keys.indexOf(key) });

// ------------------------------------------------------------------------------------------------ rank
async function embed(model: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const res = await fetch(`${ollama}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, input: texts.slice(i, i + 32) }) });
    out.push(...((await res.json()) as { embeddings: number[][] }).embeddings);
  }
  return out.map((v) => { const n = Math.hypot(...v); return v.map((x) => x / n); });
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const per = new Map<string, { ndcg: number; recall: number }>();
const t0 = Date.now();
for (const model of models) {
  const qv = await embed(ollamaModel(model), scen.map((s) => queryPrefix(model) + s.query));
  const cache = new Map<string, number[]>();
  for (const [arm, texts] of arms) {
    const todo = [...new Set([...texts.values()].filter((t) => !cache.has(t)))];
    (await embed(ollamaModel(model), todo)).forEach((v, i) => cache.set(todo[i], v));
    const dv = keys.map((k) => cache.get(texts.get(k)!)!);
    scen.forEach((s, si) => {
      const ranked = keys.map((k, i) => [dot(qv[si], dv[i]), k] as const).sort((a, b) => b[0] - a[0]).map(([, k]) => item(k));
      const expected = s.expected.map((e) => ({ ...item(e.ref), grade: e.grade ?? 1 }));
      per.set(`${model}|${arm}|${s.id}`, { ndcg: ndcgAtK(ranked, expected, 10) ?? 0, recall: recallAtK(ranked, expected, 10) ?? 0 });
    });
  }
}

// ------------------------------------------------------------------------------------------------ report
const f = (x: number, s = false) => `${s && x > 0 ? "+" : ""}${x.toFixed(3)}`;
function compare(modelA: string, armA: string, modelB: string, armB: string, split: string, slice: string) {
  const ss = scen.filter((s) => s.tags.includes(`split-${split}`) && (slice === "ALL" || s.tags.includes(slice)));
  const a = ss.map((s) => per.get(`${modelA}|${armA}|${s.id}`)), b = ss.map((s) => per.get(`${modelB}|${armB}|${s.id}`));
  if (!ss.length || a.some((x) => !x) || b.some((x) => !x)) return null;
  const d = a.map((x, i) => x!.ndcg - b[i]!.ndcg), n = d.length, mean = d.reduce((x, y) => x + y, 0) / n;
  const ci = n > 1 ? 1.96 * Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) / Math.sqrt(n) : 0;
  const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  return {
    n, wtl: `${d.filter((x) => x > 1e-9).length}/${d.filter((x) => Math.abs(x) <= 1e-9).length}/${d.filter((x) => x < -1e-9).length}`,
    delta: `${f(mean, true)} ± ${f(ci)}`, verdict: n < 5 ? "too few" : mean - ci > 0 ? "BETTER" : mean + ci < 0 ? "WORSE" : "no proven diff",
    from: f(avg(b.map((x) => x!.ndcg))), to: f(avg(a.map((x) => x!.ndcg))), rFrom: f(avg(b.map((x) => x!.recall))), rTo: f(avg(a.map((x) => x!.recall))),
  };
}
const out = [
  "# SUPPLEMENTARY vector-only replay: text strategies on northwind-sql-v1",
  "",
  "**Supplementary, vector-only replay (no permissions, no scorers, no cutoff, no keyword arm).** Not a harness run and never",
  "the headline. It isolates what the *embedding* does with each text. The harness `semantic` engine is hybrid.",
  `Generated by \`embedtext/replay.ts\` at ${new Date().toISOString()} in ${((Date.now() - t0) / 1000).toFixed(0)} s. Models: ${models.join(", ")}. Arms: ${[...arms.keys()].join(", ")}.`,
  "Paired per question, Δ nDCG@10 ± 1.96·sd/√n, W/T/L, verdict only when the CI clears 0 (same rules as report.ts).",
  "`blind:` = alias-blind corpus (embedtext/aliasblind.ts). `probe:` = mechanism probe, not a strategy.",
  "",
];
const refsFor = (arm: string) => arm.startsWith("blind:") ? ["none", "blind:context-sql"] : ["none", "context-sql"];
for (const split of ["heldout", "dev"]) {
  out.push(`## ${split === "heldout" ? "Held-out questions" : "Dev questions"}`, "",
    "| model | arm | vs | slice | n | W/T/L | Δ nDCG@10 ± CI | verdict | nDCG ref → arm | recall@10 ref → arm |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const model of models) for (const arm of [...arms.keys()].filter((a) => a !== "none")) for (const ref of refsFor(arm)) {
    if (ref === arm || !arms.has(ref)) continue;
    for (const slice of SLICES) {
      const c = compare(model, arm, model, ref, split, slice);
      if (c) out.push(`| ${model} | ${arm} | ${ref} | ${slice} | ${c.n} | ${c.wtl} | ${c.delta} | **${c.verdict}** | ${c.from} → ${c.to} | ${c.rFrom} → ${c.rTo} |`);
    }
  }
  out.push("");
}
out.push("## Original vs alias-blind, side by side (held-out, vs none)", "", "| model | text | slice | original Δ | alias-blind Δ |", "|---|---|---|---|---|");
for (const model of models) for (const arm of ["context-sql", "mech-fill-empty", "llm-fill-empty"]) for (const slice of ["ALL", "sql-only"]) {
  const o = compare(model, arm, model, "none", "heldout", slice), b = compare(model, `blind:${arm}`, model, "none", "heldout", slice);
  if (o || b) out.push(`| ${model} | ${arm} | ${slice} | ${o ? `${o.delta} (${o.verdict})` : "–"} | ${b ? `${b.delta} (${b.verdict})` : "–"} |`);
}
out.push("");
const qp = models.filter((m) => m.endsWith("+qprefix"));
if (qp.length) {
  out.push("## Query-prefix effect (BL-33): arctic with \"query: \" vs without, same documents", "",
    "| model | arm | split | n | W/T/L | Δ nDCG@10 ± CI | nDCG without → with prefix |", "|---|---|---|---|---|---|---|");
  for (const m of qp) for (const arm of arms.keys()) for (const split of ["heldout", "dev"]) {
    const c = compare(m, arm, ollamaModel(m), arm, split, "ALL");
    if (c) out.push(`| ${ollamaModel(m)} | ${arm} | ${split} | ${c.n} | ${c.wtl} | ${c.delta} | ${c.from} → ${c.to} |`);
  }
  out.push("");
}
const path = args.out ?? join(HERE, "../research/embedding-text-replay.md");
writeText(path, out.join("\n") + "\n");
console.log(`wrote ${path}`);
