// Writes a derived corpus.json per text strategy: the base corpus with generated text placed in card
// descriptions. The pipeline applies it with `--corpus-file <out>/corpus.json --text-strategy <strategy>-<mode>`.
//
//   node derive.ts --corpus ../artifacts/sql/corpus.json --strategy mech|llm --mode fill-empty|fill-all \
//     [--model qwen3:8b] [--cache-tag aliasblind] [--out ../artifacts/sql-text/<strategy>-<mode>]
//
// Strategies (research/embedding-text.md):
//   mech  native SQL → sql2text.ts rules; GUI queries → Metabase's own describe-query (cache/mbql-describe.json)
//   llm   local model summary (cache/llm-<model>.json, written by llm.ts)
// Modes:
//   fill-empty  only cards with no description get the text ("auto-describe undocumented cards")
//   fill-all    every card gets the text appended to its description (shows harm to well-described cards)
// Only card-likes change; everything else is byte-for-byte the base corpus. Fails if any card has no text.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Corpus, type EntityDef, fail, isCardLike, parseArgs, readJson, writeJson } from "../corpus-gen/lib.ts";
import { sqlToText } from "./sql2text.ts";
import { type LlmCache, cachePath, lookup } from "./llm.ts";

const args = parseArgs(process.argv.slice(2));
for (const k of ["corpus", "strategy", "mode"]) if (!args[k]) fail(`--${k} is required`);
const { strategy, mode } = args;
if (!["mech", "llm"].includes(strategy)) fail(`--strategy must be mech or llm`);
if (!["fill-empty", "fill-all"].includes(mode)) fail(`--mode must be fill-empty or fill-all`);
const base = readJson<Corpus>(args.corpus);
const cacheDir = join(import.meta.dirname, "cache");
const tableNames = Object.fromEntries(base.tables.map((t) => [t.name, t.displayName ?? t.name]));

function textFor(): (e: EntityDef) => string | undefined {
  if (strategy === "mech") {
    const p = join(cacheDir, "mbql-describe.json");
    const mbql: Record<string, string> = existsSync(p) ? readJson<{ summaries: Record<string, string> }>(p).summaries : {};
    return (e) => (e.sql !== undefined ? sqlToText(e.sql, tableNames) : mbql[e.key]);
  }
  const model = args.model ?? "qwen3:8b";
  const cache = readJson<LlmCache>(cachePath(cacheDir, model, args["cache-tag"]));
  const digest = Object.values(cache)[0]?.digest ?? fail(`empty cache for ${model}`);
  return (e) => lookup(cache, digest, e, base);
}

const text = textFor();
const missing: string[] = [];
let changed = 0, words = 0;
const entities = base.entities.map((e) => {
  if (!isCardLike(e.model)) return e;
  const has = !!e.description?.trim();
  if (mode === "fill-empty" && has) return e;
  const t = text(e);
  if (!t) { missing.push(e.key); return e; }
  changed++;
  words += t.split(/\s+/).length;
  return { ...e, description: has ? `${e.description!.trim()} ${t}` : t };
});
if (missing.length) fail(`${missing.length} cards have no ${strategy} text: ${missing.slice(0, 10).join(", ")}`);

const label = `${strategy}-${mode}`;
const out = args.out ?? join(import.meta.dirname, "../artifacts/sql-text", label);
writeJson(join(out, "corpus.json"), { ...base, comment: `${base.comment ?? ""} Derived by embedtext/derive.ts: text strategy ${label}.`.trim(), entities });
console.log(`${label}: ${changed} card descriptions written (mean ${(words / Math.max(changed, 1)).toFixed(1)} words) → ${out}/corpus.json`);
console.log(`run: node src/pipeline.ts --corpus sql --corpus-file ${out}/corpus.json --text-strategy ${label} …`);
