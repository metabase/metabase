---
name: jekyll-card-create
description: Author a new Metabase Card (question/model/metric) from scratch as serdes-format YAML and load it into the running dev instance via jekyll-mode's single-file pipeline. Use when the user asks to create/build/generate a card, question, model, or metric in this repo's local jekyll-mode dev workflow (writing into local/jekyll, not the Metabase UI or the CLI export/import flow).
---

# Jekyll-mode Card Creation

Generates a brand-new Card by hand-writing its serdes YAML representation and loading it straight into the
appdb through `metabase.jekyll-mode.load`. Sibling of the **jekyll-dashboard-create** skill (same
pipeline); see it for the Dashboard-specific version and for the general nREPL/lookup mechanics, which
aren't repeated in full here.

**Correction to the serdes-yaml-edit skill**: that skill documents `dataset_query` using legacy MBQL
(`{type: query, query: {source-table: ...}}`). Every real fixture in this repo now uses **MBQL 5's `stages`
shape** instead (`{database: ..., stages: [...], lib/type: mbql/query}`) — legacy MBQL does not appear
anywhere in current serialization_baseline output. Use the `stages` form below; do not use `serdes-yaml-edit`'s
`dataset_query` examples for new Cards. (The `representations` repo's own docs/schema call this "pMBQL" —
that's their term, not one to use going forward; say "MBQL 5".)

@./../_shared/sample-database.md

## Authoritative format reference

`/Users/camsaul/representations` is the canonical spec/schema repo for this format (npm package
`@metabase/representations`) — prefer it over this skill or serdes-yaml-edit when in doubt:

- `core-spec/v1/schemas/card.yaml` — the actual JSON Schema for a Card file; ground truth for
  required/optional fields and enums (confirms everything in step 5's template, including that
  `visualization_settings` is required but may be `{}`).
- `core-spec/v1/schemas/common/query.yaml` — the MBQL 5 query schema (stage shapes, clause options,
  `lib/uuid` handling) — confirms the `dataset_query` examples in step 2 below.
- `core-spec/v1/spec.md` — the "MBQL Query" and "Native Query" sections are a full language reference:
  joins, expressions, every filter operator, aggregation functions, window functions, template-tag types.
  Much more complete than what's transcribed here.
- `examples/v1/collections/main/queries/*.yaml` — many more real examples than are excerpted below:
  `joins.yaml`, `window_offset.yaml`, `metric_measure_segment_refs.yaml`, `native_field_filter.yaml`,
  `conditional_aggregations.yaml`, `temporal_expressions.yaml`, etc. If you need a clause not covered here,
  check for it there before guessing.
- CLI: `npx @metabase/representations generate-entity-id` / `validate-schema --folder <dir>` — see
  jekyll-dashboard-create's "Authoritative format reference" section for details (same tool, same caveat:
  structural-only, doesn't check query resolution against real metadata).

## 0. Prerequisites

Same as jekyll-dashboard-create: reachable nREPL, jekyll-mode root dir is
`(metabase.jekyll-mode.files/directory-prefix)` (currently `"local/jekyll"`), and the target Collection must
already be exported there (look up its `entity_id` the same way).

## 1. Where the shape comes from

`(defmethod serdes/make-spec "Card" ...)` — `src/metabase/queries/models/card.clj:1354-1409`. Field
categories:

- **Never write these** (`:skip`, always re-derived on load by `populate-query-fields`): `table_id`,
  `database_id` (normal case — see step 3), `query_type`, `source_card_id`, `legacy_query`,
  `cache_invalidated_at`, `view_count`, `last_used_at`, `metabot_conversation_id`, `metabot_chart_id`.
- **Plain fields**: `name`, `entity_id`, `display`, `type` (`question`/`model`/`metric` — the Toucan
  `:type` column, unrelated to any `type` key inside `dataset_query`), `description`,
  `collection_position`, `archived` (default `false`), `enable_embedding` (default `false`).
- **Portable refs** (`serdes/fk`): `collection_id` → Collection entity_id, `creator_id` → **User email**
  (e.g. `admin@example.com`, not entity_id), `made_public_by_id`, `dashboard_id`/`document_id` (only for
  cards that live exclusively inside one Dashboard/Document — a "dashboard question"). If you set
  `dashboard_id`, `collection_id` **must match that dashboard's own `collection_id`**, not just any
  collection (`spec.md`'s Entity Ownership section) — a card should never have both `dashboard_id` and
  `document_id` set.
- **Custom transforms**: `created_at` (ISO-8601 string), `dataset_query` (see step 2),
  `result_metadata` (see step 4), `parameters`/`parameter_mappings`/`visualization_settings`.

## 2. `dataset_query`: MBQL 5 stages shape

Structured question (aggregation + breakout), from
`test_resources/serialization_baseline/collections/main/queries/basic_aggregations.yaml`:

```yaml
dataset_query:
  database: Sample Database
  stages:
  - source-table: [Sample Database, PUBLIC, ORDERS]
    aggregation:
    - - count
      - lib/uuid: 11111111-1111-1111-1111-111111111111
    - - sum
      - lib/uuid: 22222222-2222-2222-2222-222222222222
      - - field
        - base-type: type/Float
        - [Sample Database, PUBLIC, ORDERS, TOTAL]
    breakout:
    - - field
      - temporal-unit: month
      - [Sample Database, PUBLIC, ORDERS, CREATED_AT]
    limit: 12
    lib/type: mbql.stage/mbql
  lib/type: mbql/query
```

Field refs are `[field, <opts-map>, <portable-path>]` — `<opts-map>` can be `{}` or carry `base-type`/
`temporal-unit`/etc.; `<portable-path>` is `[db schema table field]` (same convention as serdes-yaml-edit
documents for other models). `lib/uuid` on aggregation clauses is only needed where something else
references that clause (e.g. `order-by` on an `aggregation` ref by uuid) — omit it elsewhere.

Native SQL, from `native_query___variables.yaml`:

```yaml
dataset_query:
  database: Sample Database
  stages:
  - native: |-
      SELECT * FROM ORDERS WHERE TOTAL > {{min_total}}
    template-tags:
    - default: 50
      display-name: Minimum Total
      id: aa000001-0000-0000-0000-000000000001   # any uuid, must be unique per tag
      name: min_total
      required: true
      sectionid: number
      type: number
    lib/type: mbql.stage/native
  lib/type: mbql/query
```

A native query referencing another Card (`{{#1-basic_aggregations}}`) or a snippet
(`{{snippet: My Snippet}}`) declares it as a template tag instead of inline SQL substitution — from
`native_query___card_and_snippet_references.yaml`:

```yaml
template-tags:
- card-id: h5F2EjHsRd73Dqqh8sAtd        # referenced Card's entity_id
  display-name: Basic Aggregations
  id: cc000001-0000-0000-0000-000000000001
  name: '#1-basic_aggregations'          # must match the {{...}} token in the SQL
  type: card
- display-name: 'Snippet: Active Product Filter'
  id: cc000002-0000-0000-0000-000000000002
  name: 'snippet: Active Product Filter'
  snippet-id: WyQWnT23PF-SfbYLROllJ      # referenced Snippet's entity_id
  snippet-name: Active Product Filter
  type: snippet
```

A structured query built on top of another Card (instead of a table) uses `source-card` with the source
Card's entity_id in place of `source-table`, from `source_card_reference.yaml`:

```yaml
stages:
- source-card: h5F2EjHsRd73Dqqh8sAtd     # entity_id of the source Card
  filters:
  - - '>'
    - {}
    - [field, {base-type: type/Integer}, count]   # bare column name — referring to the source card's output
    - 100
  lib/type: mbql.stage/mbql
```

## 3. Top-level `table_id` / `database_id`: omit them

Both are auto-derived from `dataset_query` by `populate-query-fields` on load — **do not write them at the
top level**. This directly contradicts serdes-yaml-edit's claim that Card needs a top-level `table_id`;
that guidance is stale. The one exception is `database_id`, which gets written only for a Card whose
`dataset_query` has no `:database` key at all (an empty just-created native card) — not a case you'll hit
when hand-authoring a working query.

## 4. `result_metadata`: optional

Omit it for a structured (question/model) Card — it gets recomputed from the query + metadata provider on
load without running the query. For a **native** Card, column types can't be re-derived without executing
the SQL, so omitting it means the Card may show incomplete/generic typing until someone runs the query once
in the UI; include real entries (see `basic_aggregations.yaml` for the shape: `name`, `base_type`,
`display_name`, `field_ref`, `id`, `table_id`, `source`) if you know the output columns and want correct
typing immediately.

## 5. Minimal template

```yaml
name: <Card Name>
entity_id: <card-eid>
creator_id: <your email, e.g. cam@metabase.com>
display: table
collection_id: <target collection's entity_id>
type: question   # or model / metric
parameters: []
parameter_mappings: []
dataset_query:
  database: <Database name>
  stages:
  - source-table: [<Database name>, <SCHEMA>, <TABLE>]
    lib/type: mbql.stage/mbql
  lib/type: mbql/query
visualization_settings: {}
serdes/meta:
- id: <card-eid>
  label: <slug_of_name>
  model: Card
```

(`entity_id` via `npx @metabase/representations generate-entity-id`, same as Dashboard — see
jekyll-dashboard-create step 2. `:serdes/meta` is a single-hop list, not nested, since a Card is always a
top-level entity.)

## 6. Where to write it, validate, load

Same as jekyll-dashboard-create: **only `collection_id` determines where the Card actually lives** —
directory placement is cosmetic, but mirror an existing file's directory under the target Collection in
`local/jekyll/collections/...` for readability. Validate structurally first (fast, no JVM):
```bash
npx @metabase/representations validate-schema --folder local/jekyll
```
then check the query actually resolves against real synced metadata (needs `:ee`):
```bash
clojure -M:run:ee --mode checker --checker structural --export local/jekyll
clojure -M:run:ee --mode checker --checker cards --export local/jekyll
```
then load via nREPL:

```clojure
(metabase.jekyll-mode.load/load-instance-from-file! "local/jekyll/collections/<path>/<slug>.yaml")
(toucan2.core/select-one [:model/Card :id :name] :entity_id "<card-eid>")
```
