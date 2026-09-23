// Strategy #2: a local model (Ollama) writes one or two sentences on what each card answers.
// Index-time only. Output is cached in cache/llm-<model>.json keyed by a hash of (model digest, prompt), so reruns
// are free and reproducible; the cache records model, digest, prompt version, options and generation time.
//
//   node llm.ts --corpus ../scenarios/corpus/northwind-sql.json [--model qwen3:8b] [--cache-tag aliasblind] [--ollama …]
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Corpus, type EntityDef, isCardLike, parseArgs, readJson, writeJson } from "../corpus-gen/lib.ts";

// v1 produced "Measure: … Breakdown: None. Filters: None." templates (repeated boilerplate, the very thing that made
// `context` hurt) and invented breakdowns for plain table queries. v2 asks for flowing prose and states what a
// plain query is. Changed on output format only, before any strategy was measured.
export const PROMPT_VERSION = "v2";
const OPTIONS = { temperature: 0, seed: 1, num_predict: 120 };

export function prompt(e: EntityDef, c: Corpus): string {
  const table = c.tables.find((t) => t.key === e.table);
  const tableLine = table ? `Main table: ${table.displayName ?? table.name} (${c.schema}.${table.name})` : "";
  const query = e.sql !== undefined
    ? `SQL:\n${e.sql.trim()}`
    : e.mbql
      ? `Metabase GUI query on that table: ${JSON.stringify(e.mbql)}`
      : "Query: every row of that table, unfiltered and not aggregated (a plain listing).";
  return [
    "In one or two plain-English sentences (at most 40 words), say what business question this saved chart answers.",
    "Write flowing prose in business words: what is measured, how it is broken down, and any filters or time window, but only those the query actually has.",
    "Never write labels like 'Measure:' or 'Filters: None', never mention what is absent, never guess beyond the query. No preamble.",
    "",
    `Title: ${e.name}`,
    tableLine,
    query,
  ].join("\n");
}

export type LlmEntry = { key: string; model: string; digest: string; promptVersion: string; options: typeof OPTIONS; ms: number; text: string };
export type LlmCache = Record<string, LlmEntry>;

/** `tag` keeps a separate, separately frozen cache (e.g. "aliasblind"), so a frozen cache is never appended to. */
export const cachePath = (dir: string, model: string, tag?: string) =>
  join(dir, `llm-${model.replace(/[^a-z0-9.]+/gi, "_")}${tag ? `.${tag}` : ""}.json`);
const hash = (digest: string, p: string) => createHash("sha256").update(`${digest}\n${p}`).digest("hex").slice(0, 16);

/** Cached text for a card, or undefined. */
export function lookup(cache: LlmCache, digest: string, e: EntityDef, c: Corpus): string | undefined {
  return cache[hash(digest, prompt(e, c))]?.text;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model ?? "qwen3:8b";
  const ollama = (args.ollama ?? "http://localhost:11434").replace(/\/$/, "");
  const c = readJson<Corpus>(args.corpus);
  const tags = await (await fetch(`${ollama}/api/tags`)).json() as { models: { name: string; digest: string }[] };
  const digest = tags.models.find((m) => m.name === model || m.name === `${model}:latest`)?.digest ?? (() => { throw new Error(`model ${model} not pulled`); })();
  const path = cachePath(join(import.meta.dirname, "cache"), model, args["cache-tag"]);
  const cache: LlmCache = existsSync(path) ? readJson(path) : {};
  const todo = c.entities.filter((e) => isCardLike(e.model) && !cache[hash(digest, prompt(e, c))]);
  console.log(`${model} (${digest.slice(0, 12)}): ${todo.length} to generate, ${Object.keys(cache).length} cached`);
  for (const [i, e] of todo.entries()) {
    const p = prompt(e, c);
    const t0 = Date.now();
    const res = await fetch(`${ollama}/api/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: p, stream: false, think: false, options: OPTIONS }),
    });
    const text = ((await res.json()) as { response: string }).response.trim().replace(/\s+/g, " ");
    cache[hash(digest, p)] = { key: e.key, model, digest, promptVersion: PROMPT_VERSION, options: OPTIONS, ms: Date.now() - t0, text };
    if ((i + 1) % 10 === 0) writeJson(path, cache);
    console.log(`  ${e.key}: ${text.slice(0, 100)}`);
  }
  writeJson(path, cache);
  const ms = Object.values(cache).map((x) => x.ms);
  console.log(`done: ${ms.length} entries, mean ${(ms.reduce((a, b) => a + b, 0) / ms.length / 1000).toFixed(2)} s/card`);
}

// Run as a script, not when imported (import.meta.main needs Node >= 24).
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) await main();
