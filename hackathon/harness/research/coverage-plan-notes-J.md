# Coverage research: J's notes (PARTIAL, handed to I)

**Status: partial, raw findings only. No costed plan and no phases.** Agent J (branch watch) started this on
2026-09-23 ~17:28 UTC, before Voytek said it was meant for Agent I. F stopped it at 17:32 UTC. `coverage-plan.md` is I's.
These are the findings of two read-only code reads (subagent reports, spot-checked only where cited in branches.md).
Verify before relying on them. Line numbers are at worktree HEAD `188c8f412f7` plus uncommitted changes.

## 1. What each search model indexes vs embeds (baseline, committed code)

Mechanics (`src/metabase/search/ingestion.clj`):
- **Keyword**: `searchable-text` (L37-49) = the values of `:search-terms`, transformed (e.g. camel-case exploded).
- **Embedded**: `embeddable-text` (L51-76) = `"[model]\nkey: value"` lines over the same `:search-terms`, minus the spec's `:embedding-exclude` (L67-69). Raw values; no collection, table or SQL.
- **appdb Postgres**: `search_vector` = name (A) + searchable_text (B) + a `simple` copy (D) (`appdb/specialization/postgres.clj:49-63`).
- **Semantic engine**: embeds `embeddable_text` (`semantic_search/index.clj:172`), and its keyword arm reuses `searchable_text`.

| Model | Spec | Keyword | Embedded | Exists but neither indexed nor embedded |
|---|---|---|---|---|
| card / dataset / metric | `queries/models/card.clj:1475-1541` | name, description | name, description | result columns, MBQL (tables/filters/aggregation), metric definition, native SQL (see below), dashboards it's on, collection name |
| dashboard | `dashboards/models/dashboard.clj:492` | name, description | name, description | dashcards / card names, tabs, text & heading cards, filters |
| collection | `collections/models/collection.clj:2457` | **name only** | name only | **description** (render-term only; a code comment at L2472 says it was probably overlooked), contents |
| table | `warehouse_schema/models/table.clj:629` | name, display_name, description | same | **all column names and descriptions** (no Field spec at all) |
| database | `warehouses/models/database.clj:768` | name, description | same | engine, tables |
| segment | `segments/models/segment.clj:240` | name, description | same | filter definition |
| measure | `measures/models/measure.clj:224` | name, description | same | aggregation definition |
| action | `actions/models.clj:579` | name, description | same | parameters; native query only as raw JSON |
| document | `documents/models/document.clj:514` | name + **body** (ProseMirror → text) | **name only** (`:embedding-exclude #{:document}`, L529) | |
| transform | `transforms/models/transform.clj:562` | name, description | same | target table; source in `native_query`. **Visible to superusers only**, and the harness user isn't one |
| indexed-entity | `indexed_entities/models/model_index.clj:184` | the indexed value | the value | rest of the row; refreshed only by the model-index job |

- **Native SQL**: extracted only for native cards (`card.clj:1464-1473`) into the `native_query` attr. It's searched by keyword only with `search_native_query=true` (`search/api.clj:232`), and never embedded at baseline. E's uncommitted `context-sql` variant appends `sql:` (1000 chars).
- **Languages**: the keyword side uses PG dictionaries by `search-language` or site locale (`search/util.clj:53-95`). Semantic has no language logic; it depends on the embedder being multilingual.
- **Uncommitted, in this worktree**: E's `search-embedding-text-variant` (`context` adds collection/database/table/display lines; `context-sql` adds SQL). A `semantic-search-keyword-arm-enabled` setting (BL-35) also appears in the diff.

## 2. What the harness can build today (corpus-gen)

`corpus-gen/lib.ts:10-94`, `apply.ts`:
- **Can create**:
  - DB (one, via sync)
  - tables: display_name + description only (`apply.ts:132-141`)
  - collections: name, parent, `restricted`
  - card / dataset / metric: native SQL or a small MBQL subset
  - dashboard: name, description, collection only
  - document: one-paragraph body
  - segment: definition fixed to `not-null`
  - measure: definition fixed to `count`
  - a non-admin harness user
- **Missing**:
  - field/column descriptions, display names, semantic types
  - collection descriptions
  - personal collections
  - archived items
  - dashcards / tabs / text cards / dashboard filters
  - actions, snippets, transforms, model indexes (indexed-entity)
  - joins
  - verified / creator variation
- Scenarios (`lib.ts:108-118`) have **no per-scenario filter fields**. The runner passes one run-wide `models` param (`runner/src/config.ts:37`, `adapter.ts:134-138`).

## 3. What we measure today

- **golden** (56 scenarios): en 52, pl 2, ja 2.
  - Tags: paraphrase 13, concept 10, exact-name 8, cross-lingual 7, rare-token 6, typo 5, ambiguous 4, empty-expected 4, near-miss 4, permissions 1.
  - Scenarios expecting each model: card 49, dashboard 26, metric 22, dataset 12, segment 7, document 6, table 6, measure 5; collection and database 0.
  - Only `empty-04` has `expectedAbsent`. No duplicate names across types.
- **sql** (60): all cards. 36 dev / 24 held-out, blind-written by a subagent from one-line intents, with labels and split frozen first (`worklogs/I-embedresearch.md:55-80`).
- **Metrics**: recall/precision/MRR/nDCG@10 (graded), zero-result, false-positive, permission leak, agreement, latency, and per-tag breakdowns (`metrics/src/metrics.ts`). There's no per-expected-type breakdown unless types are added as tags.

## 4. Sample sizes (from the paired CIs seen so far)

| n | ± (paired Δ nDCG, 95%) | Sources |
|---|---|---|
| ~50–56 | 0.03–0.09 | `worklogs/F-overseer.md` |
| 24 | 0.13–0.19 | I's held-out numbers; `research/embedding-text-replay.md` |
| 13 | ~0.20 | `research/embedding-text-replay.md` |
| 5–9 | 0.2–0.4 | small tag slices |

J's inference: about 20–30 questions per type are needed to separate effects of about 0.1–0.15 within a type.

## 5. Timings

- **golden pipeline**: about 2m40s end to end, including ~1 min boot and indexing 250 docs in ~1 min (arctic ~10 s). 840 observations.
- **Re-init to a new text variant**: 45–50 s.
- **Apply**: golden ~5–7 s; sql ~4.5 s; scale-1000 ~17 s; scale-10000 ~280 s (sync 198 s).

## 6. First impressions (J, not a plan)

- **Engine-only gaps (add questions, no Metabase change)**: names/descriptions of every type (collection, table, segment, measure, database are thin or at zero), document body (keyword-indexed, not embedded, so it separates hybrid from vector-only engines such as sqlite-vec1), filters (needs scenario filter fields plus adapter pass-through), permissions beyond one scenario, same name across types, more languages.
- **Need Metabase opt-in changes to embed more** (E/H style): document body (drop `:embedding-exclude`), collection description (spec), table columns (no Field spec; needs a join), dashboard contents, metric/segment/measure definitions (describe-query exists in lib), native SQL (E's `context-sql` exists).
- **Can't be measured with today's harness user**: transforms (superuser-only).
