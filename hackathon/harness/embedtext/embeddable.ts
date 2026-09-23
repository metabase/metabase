// The exact text Metabase embeds for an item under the `baseline` embedding-text variant, rebuilt from a corpus.
// Mirrors src/metabase/search/ingestion.clj `embeddable-text` (baseline arity): "[<model>]\n" + one "<key>: <value>"
// line per spec `:search-terms` key in spec order, skipping blank values and `:embedding-exclude` keys; search-term
// transforms (explode-camel-case) are NOT applied. Spec search-terms (see the model files):
//   card/dataset/metric (queries/models/card.clj:1501), dashboard (dashboards/models/dashboard.clj:510),
//   segment (segments/models/segment.clj:249), measure (measures/models/measure.clj:232): name, description
//   table (warehouse_schema/models/table.clj:649): name, display_name, description
//   database (warehouses/models/database.clj:777): name, description
//   collection (collections/models/collection.clj:2469): name
//   document (documents/models/document.clj:525): name (body excluded from embeddings)
import { type Corpus } from "../corpus-gen/lib.ts";

const line = (k: string, v: string | undefined) => (v?.trim() ? [`${k}: ${v.trim()}`] : []);

/** corpus key → embeddable text, for every item the corpus creates. */
export function embeddableTexts(c: Corpus): Map<string, string> {
  const out = new Map<string, string>();
  const doc = (model: string, lines: string[]) => `[${model}]\n${lines.join("\n")}`;
  out.set(c.database.key, doc("database", [...line("name", c.database.name)]));
  for (const t of c.tables) out.set(t.key, doc("table", [...line("name", t.name), ...line("display_name", t.displayName), ...line("description", t.description)]));
  for (const x of c.collections) out.set(x.key, doc("collection", line("name", x.name)));
  for (const e of c.entities) {
    out.set(e.key, doc(e.model, e.model === "document" ? line("name", e.name) : [...line("name", e.name), ...line("description", e.description)]));
  }
  return out;
}
