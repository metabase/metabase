// Robustness check for the raw-SQL result: an "alias-blind" copy of the SQL corpus. My corpus SQL names its outputs well
// (`as chargeback_rate`), and real-world SQL often doesn't. If raw SQL wins only because of those names, this shows it.
//
// RULE (frozen 2026-09-23 before running anything on it):
//   In every native SQL card, every `AS <identifier>` that names a COMPUTED select expression (anything but a bare,
//   optionally table-qualified column) is renamed to c1, c2, … in order of first appearance in the statement; every
//   other whole-word occurrence of that identifier in the same statement is renamed with it, so the SQL stays valid,
//   except inside string literals ('month') and as a date-part keyword (`extract(year from …)`).
//   An alias that is also a column name somewhere in the corpus, or a CTE name, is left alone (renaming would corrupt it).
//   Table/CTE names, columns, filters, literals, comments and everything else are untouched. MBQL cards, names and
//   descriptions are untouched. corpusId becomes northwind-sql-v1-aliasblind; entity keys are unchanged, so the same
//   scenarios and labels apply.
//
//   node aliasblind.ts [--corpus ../artifacts/sql/corpus.json] [--out ../artifacts/sql-aliasblind/corpus.json]
import { join, resolve } from "node:path";
import { type Corpus, parseArgs, readJson, writeJson } from "../corpus-gen/lib.ts";

export function blindSql(sql: string, columnNames: Set<string>): string {
  const renames = new Map<string, string>();
  const cteNames = new Set([...sql.matchAll(/\b([a-z_]\w*)\s+as\s*\(/gi)].map((m) => m[1].toLowerCase()));
  // `<expr> as <alias>` where <expr> ends in `)`, a number/literal or an operator expression, i.e. not a bare column.
  for (const m of sql.matchAll(/([^\s,]+)\s+as\s+([a-z_][a-z0-9_]*)\b/gi)) {
    const [, before, alias] = m;
    const bareColumn = /^([a-z_]\w*\.)?[a-z_]\w*$/i.test(before);
    if (bareColumn || columnNames.has(alias.toLowerCase()) || cteNames.has(alias.toLowerCase()) || renames.has(alias)) continue;
    renames.set(alias, `c${renames.size + 1}`);
  }
  let out = sql;
  for (const [alias, neutral] of renames) {
    // Split on string literals so they are never touched; skip the date part in `extract(<alias> from`.
    out = out.split(/('(?:[^']|'')*')/).map((part, i) =>
      i % 2 ? part : part.replace(new RegExp(`(?<!extract\\s*\\(\\s*)\\b${alias}\\b`, "gi"), neutral)).join("");
  }
  return out;
}

export function blindCorpus(c: Corpus): Corpus {
  const cols = new Set(c.tables.flatMap((t) => t.columns.map((x) => x.name.toLowerCase())));
  return {
    ...c,
    corpusId: `${c.corpusId}-aliasblind`,
    comment: `${c.comment ?? ""} Alias-blind copy (embedtext/aliasblind.ts): computed SQL output aliases renamed to c1, c2, ….`.trim(),
    entities: c.entities.map((e) => (e.sql === undefined ? e : { ...e, sql: blindSql(e.sql, cols) })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const args = parseArgs(process.argv.slice(2));
  const src = readJson<Corpus>(args.corpus ?? join(import.meta.dirname, "../artifacts/sql/corpus.json"));
  const out = args.out ?? join(import.meta.dirname, "../artifacts/sql-aliasblind/corpus.json");
  const b = blindCorpus(src);
  writeJson(out, b);
  const changed = b.entities.filter((e, i) => e.sql !== src.entities[i].sql).length;
  console.log(`${b.corpusId}: ${changed}/${b.entities.filter((e) => e.sql).length} SQL cards changed → ${out}`);
}
