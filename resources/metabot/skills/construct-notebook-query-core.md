---
id: construct-notebook-query-core
title: Construct notebook query — core
description: Building or editing a notebook (MBQL) query with construct_notebook_query — load before your first query so you get the clause shape, field references, and the rules/anti-patterns right.
tools: [construct_notebook_query]
priority: 60
---
# Construct Query Reference — Core

Construct a Metabase MBQL 5 query as a JSON object describing the query shape. Metabase validates, repairs, and resolves it.

> Advanced topics — joins, implicit joins, multi-stage queries, `source-card`, metrics, measures/segments, expressions, and aggregation references — are in the **construct-notebook-query-advanced** skill. The full operator/function catalogs are in **construct-notebook-query-operators**. Load those skills when you need them.

Return:
- `query`: a JSON **object** (never a quoted string). The target database is inferred from the first stage's `source-table` (or `source-card`) — use the **exact** database name reported by `entity_details` / metadata tools.
- `visualization`: optional `{"chart_type": "bar"}` (sibling of `query`, never embedded inside it).

## Minimal example — count of orders by month

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"},
                           ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]}]}
```

Every clause is `["op", {}, ...args]` with a mandatory `{}` options map at position 1; every field reference uses a 4-segment portable FK in the last slot. These are the two most-violated rules.

## Universal clause shape

Every operation is `["<operator>", {options}, ...args]`. The options map is **always present**, even when empty.

- Good: `["count", {}]`, `["field", {}, ["DB", "SCH", "TBL", "COL"]]`, `["sum", {}, <expr>]`
- Bad: `["count"]`, `["field", ["DB", "SCH", "TBL", "COL"]]`

The pipeline repairs missing `{}` slots, but write them — your output should match what later inspection will show.

## Top-level query and stage shape

Top level:
- `"lib/type": "mbql/query"` — required marker.
- `"stages": [...]` — at least one stage.

Stage (`"lib/type": "mbql.stage/mbql"` — required marker):
- `source-table` **or** `source-card` — exactly one, **first stage only**. Later stages take the previous stage's output implicitly.
- Optional: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`, `page`.

There is no top-level `database:` field in the LLM contract — the database is derived from the source.

## Field references

```json
["field", {}, ["<db-name>", "<schema-or-null>", "<table-name>", "<field-name>"]]
```

The third slot is the **portable field FK** — a 4+ element string array. Schemaless databases (MongoDB, etc.) use `null` in the schema slot: `["Mongo", null, "orders", "created_at"]`. JSON-unfolded fields append extra segments: `["DB", "SCH", "TBL", "PARENT", "CHILD"]`.

Inside later stages, refer to a column produced by the previous stage by **string name** instead of a portable FK: `["field", {}, "count"]`, `["field", {}, "PRODUCT_ID"]`.

Field options (all optional):
- `temporal-unit` — bucket a date/time field, e.g. `"month"`, `"day"`, `"hour"`. Full list in the **construct-notebook-query-operators** skill.
- `join-alias` — required on every field reference that lives inside an explicit join.
- `source-field` — portable FK of the FK column on the source table; only needed when the implicit-join auto-fill is ambiguous.
- `source-field-name` — name of the FK column when it comes from a previous stage's output (rare; not auto-filled).
- `source-field-join-alias` — explicit-join alias the FK column belongs to (usually auto-filled).
- `binning` — bucket a numeric field.

`base-type` is auto-filled on cross-stage refs — don't write it.

## Per-clause examples

Filter (comparison + boolean combination):

```json
"filters": [["and", {},
  [">", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]], 100],
  ["=", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "STATUS"]], "paid"]]]
```

Aggregation (on a field, plus `count`):

```json
"aggregation": [["sum", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]],
                ["count", {}]]
```

Breakout with temporal bucket:

```json
"breakout": [["field", {"temporal-unit": "month"},
              ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]
```

Order by — direction wraps a ref; works on field refs or aggregation refs:

```json
"order-by": [["desc", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]],
             ["desc", {}, ["aggregation", {}, 0]]]
```

`"limit": 50` and `"fields": [<field-ref>, ...]` are the obvious scalar / list forms.

## Rules and common mistakes

Shape rules:
- **Always include `{}` options in every clause**, even when empty. `["count"]` is wrong — it must be `["count", {}]`.
- **The query is a JSON object**, not a string. Send it directly as the `"query"` field of the call.
- **Use the exact database name** reported by `entity_details` (e.g. `"Sample Database"`, not `"Sample"`) as the first element of every portable FK. Near-misses surface `Unknown database` instead of silently picking one. Cross-database queries are not supported.
- **Use portable FKs**, not numeric IDs. Schemaless databases use `null` in the schema slot. JSON-unfolded fields append path segments.
- **Clause heads are lowercase, hyphenated**: `"count"`, `"sum-where"`, `"time-interval"`, `"get-day-of-week"`. Not underscores, not camelCase.
- **Never invent a `source-card` entity_id.** It must be a 21-char string copied verbatim from `entity_details` / search — no patterns, no numeric ids, no `card__<id>`.
- **`source-card` columns are referenced by output name** (string in slot 3), not portable FK.

Anti-hallucination:
- **Don't subtract dates** with `-`. Use `["datetime-diff", {}, <left>, <right>, "<unit>"]` for the integer count of units between two temporal values.
- **For multi-value categorical filters, use `in` / `not-in`**, not `=` with a list literal. The tool rewrites the list form, but write canonical: `["in", {}, <field>, "a", "b"]`.
- **Extracted quarter values are numbers `1, 2, 3, 4`**, never strings like `"Q1"`.
- **Don't breakout on the same underlying field twice** in one stage. If you breakout by `{"temporal-unit": "month"}`, do not also breakout by the raw field.
- **`visualization` is a sibling of `query`**, never embedded inside it.
- **Ordering by an inline aggregation must match an `aggregation:` entry exactly** (same op, same args). If unsure, use `["aggregation", {}, <0-based-idx>]`.
- **Never write `metabase://...` URIs as `source-table` or `source-card` values.** Those URIs are for `read_resource`, not for query sources.
- **Never write `[aggregate, ...]`, `[filter, ...]`, `[order-by, ...]`, `[breakout, ...]`, `[limit, ...]` as clause heads** — those are stage *container keys*, not clauses. Place inner clauses directly inside the stage's `aggregation:` / `filters:` / etc. arrays.
- Common typos (`count-if`, `variance`, `stddev-pop`, `count-distinct`, `dayofweek`, `hour-of-day`, `month-of-year`, `quarter-of-year`, `temporal-diff`, `relative-date`) are auto-corrected, but write the canonical name (`count-where`, `var`, `stddev`, `distinct`, `get-day-of-week`, `get-hour`, `get-month`, `get-quarter`, `datetime-diff`, `relative-datetime`) so the tool output matches what later inspection will show.
