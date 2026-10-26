---
id: construct-notebook-query-advanced
title: Construct notebook query — advanced
description: Joins (explicit and implicit), multi-stage queries, querying saved questions/models with source-card, metrics, measures, segments, expressions, and aggregation references in construct_notebook_query — load when a query needs any of these.
tools: [construct_notebook_query, document_construct_model_chart]
priority: 50
---
# Construct Query Reference — Advanced

These are the advanced building blocks for `construct_notebook_query`. The base clause shape, field references, and rules live in the **construct-notebook-query-core** skill; the operator/function catalogs live in **construct-notebook-query-operators**.

## Aggregation references

To refer to an aggregation already in the same stage's `aggregation` list — e.g. from `order-by`:
1. **Inline** — repeat the clause itself. The inline form must match an entry in `aggregation` **exactly** (same op, same args). The tool rewrites it to a reference.
2. **By 0-based index** (preferred when reused) — `["aggregation", {}, 0]` means "the first aggregation".

Out-of-range indices surface a clear error listing every available aggregation with its index.

## Expressions

Define custom columns inside a stage using `expressions` and reference by name with `["expression", {}, "<Name>"]`. Object form (preferred); the name becomes the column's display name.

```json
"expressions": {
  "Subtotal": ["+", {},
               ["field", {}, ["Sample Database", null, "ORDERS", "TOTAL"]],
               ["field", {}, ["Sample Database", null, "ORDERS", "TAX"]]]
},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

A sequential form is also accepted, but the name must live in the defining clause's own options as `lib/expression-name` — `[["+", {"lib/expression-name": "Subtotal"}, <a>, <b>], ...]`. There is no `["expression", {}, "Name", expr]` definition form; `["expression", {}, "<Name>"]` is only a *reference* to an already-defined expression. Prefer the object form above.

## Joins (explicit)

```json
"joins": [{
  "alias": "Products",
  "strategy": "left-join",
  "stages": [{"lib/type": "mbql.stage/mbql",
              "source-table": ["Sample Database", null, "PRODUCTS"]}],
  "conditions": [["=", {},
    ["field", {}, ["Sample Database", null, "ORDERS", "PRODUCT_ID"]],
    ["field", {"join-alias": "Products"},
     ["Sample Database", null, "PRODUCTS", "ID"]]]]
}],
"breakout": [["field", {"join-alias": "Products"},
              ["Sample Database", null, "PRODUCTS", "CATEGORY"]]]
```

- `alias` is a free-choice string; use it consistently in conditions, breakout, aggregation, order-by.
- `strategy` is one of `"left-join"`, `"right-join"`, `"inner-join"`, `"full-join"`. Default `"left-join"`.
- **Every** field reference on the joined side must carry `{"join-alias": "<same-alias>"}`.
- Join `conditions` accept only `=`, `!=`, `<`, `<=`, `>`, `>=` — no `between`, `in`, `and`/`or` wrappers.

## Implicit joins

Reference a field on a related table directly — when the source has exactly one FK to that target, the tool auto-fills `source-field` and performs the implicit join:

```json
"source-table": ["Sample Database", null, "ORDERS"],
"aggregation": [["count", {}]],
"breakout": [["field", {}, ["Sample Database", null, "PRODUCTS", "CATEGORY"]]]
```

- **Multiple FKs** to the target → `:ambiguous-fk` lists them. Retry with explicit `{"source-field": ["DB", "SCH", "SRC", "FK_COL"]}` on the field.
- **No FK path** → `:no-fk-path`. Switch to an explicit `joins` entry, or pick a field on the source table.
- Inside an explicit `joins` block, joined-side field refs still need `{"join-alias": ...}` — implicit-join repair does not rewrite those.
- If the FK column lives on a previous stage's output, write `{"source-field-name": "<col>"}` (not auto-filled).
- If multiple explicit joins all expose the target FK, `:ambiguous-fk-via-join` lists them — set `{"source-field-join-alias": "<alias>"}` to pick one.

**Tip:** where `read_resource` is available, discover FKs with `read_resource metabase://table/<id>/fields` — FK columns are tagged `fk_target_fully_qualified_name="schema.table.field"`, so always look for one before assuming a column lives on the current table. Without `read_resource`, call `list_available_fields` with the table's id in `table_ids` — it emits the same `fk_target_fully_qualified_name` on every FK column. (All three id arrays — `table_ids`, `model_ids`, `metric_ids` — are required; pass `[]` for the ones you don't need.)

## Multi-stage queries

Every stage after the first consumes the previous stage's output. Only the first stage has a `source-table`/`source-card`; later stages omit it.

Post-aggregation filter — count orders per product, keep only those with > 10:

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": ["Sample Database", null, "ORDERS"],
   "aggregation": [["count", {}]],
   "breakout": [["field", {}, ["Sample Database", null, "ORDERS", "PRODUCT_ID"]]]},
  {"lib/type": "mbql.stage/mbql",
   "filters": [[">", {}, ["field", {}, "count"], 10]]}
]
```

Re-aggregate — average daily total by month:

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": ["Sample Database", null, "ORDERS"],
   "aggregation": [["sum", {}, ["field", {}, ["Sample Database", null, "ORDERS", "TOTAL"]]]],
   "breakout": [["field", {"temporal-unit": "day"},
                 ["Sample Database", null, "ORDERS", "CREATED_AT"]]]},
  {"lib/type": "mbql.stage/mbql",
   "aggregation": [["avg", {}, ["field", {}, "sum"]]],
   "breakout": [["field", {"temporal-unit": "month"}, ["field", {}, "CREATED_AT"]]]}
]
```

- Cross-stage refs use a **string name** in slot 3 (e.g. `["field", {}, "count"]`). The name is whatever the previous stage's aggregation/breakout/field produced (`count`, `sum`, or the source field's name). A `distinct` (count-of-distinct-values) aggregation produces a column named **`count`** — reference it as `["field", {}, "count"]`, not `"distinct"`.
- Within the **same stage**, refer to your own aggregation with `["aggregation", {}, <idx>]` (see Aggregation references above). In a **later** stage, use the cross-stage string-name form against the previous stage's output.
- Joins, expressions, filters, aggregation, breakout, order-by, limit are all valid in later stages.

## Rates and ratios (numerator ÷ denominator)

A rate like **open rate**, **bounce rate**, **conversion rate**, or **% of total** divides one aggregation by another. What you **cannot** do is divide two aggregations inside `expressions:` — a custom column is computed per row, so aggregations aren't allowed there and you get a *non-aggregation expression* error. Two shapes do work:

**One stage — divide inside `aggregation:`** (simplest when the ratio is all you need). An arithmetic clause over aggregations is itself a valid aggregation:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", null, "ORDERS"],
             "aggregation": [["/", {},
                              ["count-where", {},
                               ["<", {}, ["field", {}, ["Sample Database", null, "ORDERS", "TOTAL"]], 50]],
                              ["count", {}]]],
             "breakout": [["field", {"temporal-unit": "month"},
                           ["Sample Database", null, "ORDERS", "CREATED_AT"]]]}]}
```

**Two stages** — use this when you also want the numerator and denominator as their own columns, or when the ratio needs further post-aggregation work. Compute them as separate aggregations in **stage 1**, then divide in **stage 2**.

Worked example — share of small orders per month (`count of orders under $50 ÷ total orders`):

```json
{"lib/type": "mbql/query",
 "stages": [
   {"lib/type": "mbql.stage/mbql",
    "source-table": ["Sample Database", null, "ORDERS"],
    "aggregation": [
      ["count-where", {}, ["<", {}, ["field", {}, ["Sample Database", null, "ORDERS", "TOTAL"]], 50]],
      ["count", {}]],
    "breakout": [["field", {"temporal-unit": "month"},
                  ["Sample Database", null, "ORDERS", "CREATED_AT"]]]},
   {"lib/type": "mbql.stage/mbql",
    "expressions": {
      "Small Order Rate": ["/", {}, ["field", {}, "count_where"], ["field", {}, "count"]]},
    "fields": [["field", {}, "CREATED_AT"],
               ["expression", {}, "Small Order Rate"]]}]}
```

Stage 2 references each stage-1 aggregation by the **output column name** it produced — `count`, `sum`, `avg`, etc., and `count_where` for `count-where` — and a `breakout`/passthrough column keeps its own name (e.g. `CREATED_AT`). Don't worry about the exact spelling: the tool canonicalises common variants for you (a hyphenated `count-where` or a quoted `"count"` is matched to the real column), so use the natural name. If two aggregations would collide on a name, give one an explicit `{"name": "..."}` to disambiguate. Multiply by 100 for a percentage: `["*", {}, ["/", {}, ["field", {}, "count_where"], ["field", {}, "count"]], 100]`.

## Saved questions and models (`source-card`)

Instead of `source-table`, use `source-card` to query an existing question or model. The value is the card's **portable entity id** — a 21-char opaque string reported by search and `read_resource` as `portable_entity_id`.

1. Get the `portable_entity_id` from a tool response. `search` and `read_resource` (`metabase://question/<id>`, `metabase://model/<id>`) include it on the result tag — reuse what's already in context, no extra call needed.
2. Copy it **verbatim** into `source-card`. The id is opaque — never guess, construct, or abbreviate.
3. Reference the card's columns by output **name** (string in slot 3), not portable FK. If you don't know the names and `read_resource` is available, call `read_resource metabase://question/<numeric-id>/fields` (or `.../model/...`). Without `read_resource`: for a **model**, call `list_available_fields` with its numeric id in `model_ids` (`table_ids` and `metric_ids` are required too — pass `[]`). For a **saved question**, `list_available_fields` has no lookup — passing a question id in `model_ids` errors ("not a valid model id, it's a question"). Reuse the column names already visible from an earlier `search` or tool result instead of guessing.

```json
{"lib/type": "mbql.stage/mbql",
 "source-card": "T4wA_GPFwGb6R4FxIDGTo",
 "filters": [[">", {}, ["field", {}, "total"], 100]],
 "limit": 50}
```

A stage has either `source-table` **or** `source-card`, never both. The card must live in the same database as the rest of the query (no cross-database queries). Falling back to native SQL like `SELECT * FROM {{#<id>-<slug>}}` is **not** acceptable — always use `source-card`.

## Metrics

> Before hand-building any named aggregation (a rate, ratio, or "X rate"/"average X"), check whether a published **metric** or table **measure** already defines it and reference that instead — see "A named measure is almost always a defined metric, measure, or segment" in the data-sources guidance. Only fall back to the two-stage rate recipe above when discovery finds no matching definition.

A metric is a predefined aggregation. Its `<metric>` tag identifies the source to use: a base table, saved question or model. Build the stage on that source. The tag carries at most one of these attributes:

- `base_table_fully_qualified_name` names a base table. Combine it with `database_name` to form the portable FK for `source-table`.
- `source_card_portable_entity_id` names a saved question or model. Copy the ID verbatim into `source-card`.
- `source_unavailable="true"` means that the metric has no source available to you. Do not use it.

To use a metric:

1. Copy the source attribute into the stage. Never invent schema or table names, or substitute a base table for the source card. If the tag carries `source_unavailable="true"`, or carries neither source attribute, do not use the metric or guess its source. Say that the metric is not available to you and express the aggregation directly instead, or ask which source to use.
2. Reference the metric as `["metric", {}, "<portable_entity_id>"]` in `aggregation`.
3. Use dimensions from the metric's **Dimensions** table for filters and breakouts on the same stage. Read the `Source table` column first. Names such as `id` and `created_at` can appear on several tables, and the table determines how to reference a dimension:
   - Copy `Reference` verbatim for a dimension on the metric's own source. Its portable FK works on card and table stages.
   - A dimension on an FK-related table can be used in `breakout:` when one foreign key reaches that table. This works on a `source-table` and a `source-card` stage alike. Otherwise, follow the tool's error: add an explicit `joins` entry (see "Joins (explicit)") on the same stage, keep the metric's source, and break out on the field using the join alias.
   - Use the output machine name for an expression or aggregation column computed by the card. These columns have no portable FK.

A table metric with `base_table_fully_qualified_name="PUBLIC.ORDERS"`:

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": ["Sample Database", null, "ORDERS"],
 "filters": [[">", {}, ["field", {},
                        ["Sample Database", null, "ORDERS", "TOTAL"]], 0]],
 "aggregation": [["metric", {}, "aB3cD4eF5gH6iJ7kL8mN9"]]}
```

A card metric with `source_card_portable_entity_id="T4wA_GPFwGb6R4FxIDGTo"`:

```json
{"lib/type": "mbql.stage/mbql",
 "source-card": "T4wA_GPFwGb6R4FxIDGTo",
 "filters": [[">", {}, ["field", {},
                        ["Sample Database", null, "ORDERS", "TOTAL"]], 0]],
 "aggregation": [["metric", {}, "aB3cD4eF5gH6iJ7kL8mN9"]]}
```

A metric with `source_card_portable_entity_id` requires that exact card. Substituting its base table causes an `Incompatible metric` error. Some metrics whose definition starts from a card require a base table instead; their tags carry `base_table_fully_qualified_name`. Use the attribute provided by the tag.

Metrics are aggregations. Put the metric's own `portable_entity_id` in its `aggregation` clause, never in `source-table` or `source-card`. The `source_card_portable_entity_id` identifies its source card and belongs in `source-card`. Use `metabase://metric/<id>` URIs to read metadata via `read_resource`; do not embed them in queries.

## Using measures and segments

A measure or segment can be referenced two ways. **Prefer the opaque-id clause** — it preserves the measure/segment's identity in the rendered notebook (chip with the official name, click-through to the definition, lineage tooling sees the dependency, definition updates propagate).

### Preferred — opaque-id clause

Each `<measure>` and `<segment>` block on a `<table>` carries a `portable_entity_id="…"` attribute (a 21-char NanoID). Copy it verbatim:

```json
"aggregation": [["measure", {}, "<portable_entity_id>"]]
"filters": [["segment", {}, "<portable_entity_id>"]]
```

The stage's `source-table` must be the table the measure/segment belongs to (the same `<table>` block where you saw the `<measure>` / `<segment>` element).

### Fallback — inline the `<definition>` body

When you need to **compose on top of** a measure or segment (add an extra filter the segment doesn't include, breakout an aggregation the measure doesn't have, …), copy the JSON array inside `<definition>` directly into your stage's `aggregation: [...]` (measure) or `filters: [...]` (segment) and add your own clauses alongside. The definition is in the same portable form the tool expects.

### Don't

- Never invent a `portable_entity_id` — only use the value reported in a tool response.
- The matching aggregation-only opaque-id clause is `["metric", {}, "<portable_entity_id>"]` (for metrics, which live independently of a table — see Metrics above).
