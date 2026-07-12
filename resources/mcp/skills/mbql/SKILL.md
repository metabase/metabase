---
name: mbql
description: Author and debug the MBQL 5 query bodies `execute_query` takes — the stage/clause shape, portable field references, filters, aggregations, breakouts, expressions, explicit and implicit joins, multi-stage pipelines, querying a saved card with `source-card`, and referencing metrics, measures, and segments. Load before writing any query body, and when a query is rejected or returns the wrong answer. Triggers — "count orders by month", "join products", "average per customer", "the query came back empty", "validation error at /stages/0".
---

# MBQL

MBQL is the structured query language `execute_query` takes: a JSON object describing the query, which
Metabase validates against the real database metadata before it runs. Prefer it over native SQL — it is
portable across warehouse engines, and the server can tell you what's wrong with it before it executes.
Reach for `execute_sql` (and the `native-sql` skill) only when structured MBQL can't express what you
need.

`references/operators.md` is the full catalog of aggregations, filters, expressions, and temporal
units. This file is the shape and the traps.

## The loop

1. `browse_data(action: "get_fields", table_ids: [...])` — you cannot write a field reference without
   the exact database, schema, table, and column names.
2. `execute_query(query: {...}, validate_only: true)` — validates against schema and metadata, and
   returns a `query_handle` without running anything.
3. `execute_query(query_handle: "...")` — run it.
4. `question_write(method: "create", query_handle: "...")` — save exactly what you ran.

Skipping step 1 is the single most common cause of a query that runs and answers the wrong question.

## The shape

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"},
                           ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]}]}
```

- `"lib/type": "mbql/query"` at the top, `"stages"` with at least one stage.
- A stage is `"lib/type": "mbql.stage/mbql"` plus any of `source-table`, `source-card`, `filters`,
  `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`.
- Only the **first** stage carries `source-table` or `source-card` — exactly one of them, never both.
  Later stages read the previous stage's output.
- There is no top-level `database` key: the database comes from the source.

## The two rules that break most queries

**The options map is element 1, always.** Every clause is `["op", {options}, ...args]`, and the options
map is present even when empty.

```json
["count", {}]                                              // not ["count"]
["field", {}, ["DB", "SCHEMA", "TABLE", "COLUMN"]]         // not ["field", ["DB", ...]]
["sum", {}, ["field", {}, ["DB", "SCHEMA", "ORDERS", "TOTAL"]]]
```

**Field references are portable name arrays, not numeric ids.** The array is
`[database, schema, table, column]` — the exact names `browse_data` reported, not near-misses ("Sample
Database", not "Sample"). Schemaless databases (MongoDB) put `null` in the schema slot. JSON-unfolded
columns append segments: `["DB", "SCHEMA", "TABLE", "PARENT", "CHILD"]`.

Cross-database queries do not exist. Every reference in a query resolves in one database.

## Filters, aggregations, breakouts

```json
"filters": [["and", {},
             [">", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]], 100],
             ["=", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "STATUS"]], "paid"]]],
"aggregation": [["sum", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]]],
"breakout": [["field", {"temporal-unit": "month"},
              ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]],
"order-by": [["desc", {}, ["aggregation", {}, 0]]],
"limit": 50
```

- A **constraint is a filter, not a breakout.** "only paid orders", "for the EU region" → `filters`.
  Reserve `breakout` for grouping language: "by", "per", "for each", "over time".
- Apply *every* constraint the user stated. Dropping one produces a query that runs cleanly and answers
  a different question.
- An explicit date or year ("in 2024") is an absolute filter. Use `time-interval` /
  `relative-datetime` only for relative language ("last 30 days", "year to date").
- Refer to an aggregation in the same stage by 0-based index: `["aggregation", {}, 0]`.
- Multi-value categorical filters are `["in", {}, <field>, "a", "b"]`, not `=` with a list.

## Expressions

Custom columns live in `expressions` and are referenced by name.

```json
"expressions": {"Subtotal": ["-", {},
                             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]],
                             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TAX"]]]},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

## Joins

**Implicit** — reference a column on a related table directly, and Metabase follows the foreign key:

```json
"source-table": ["Sample Database", "PUBLIC", "ORDERS"],
"aggregation": [["count", {}]],
"breakout": [["field", {}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]
```

Two FKs to the same target is ambiguous — the error lists them; disambiguate with
`{"source-field": ["DB", "SCHEMA", "ORDERS", "PRODUCT_ID"]}` on the field. No FK path at all means you
need an explicit join.

**Explicit** — a `joins` entry with an alias, and every field on the joined side carrying it:

```json
"joins": [{"alias": "Products",
           "strategy": "left-join",
           "stages": [{"lib/type": "mbql.stage/mbql",
                       "source-table": ["Sample Database", "PUBLIC", "PRODUCTS"]}],
           "conditions": [["=", {},
                           ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]],
                           ["field", {"join-alias": "Products"},
                            ["Sample Database", "PUBLIC", "PRODUCTS", "ID"]]]]}],
"breakout": [["field", {"join-alias": "Products"},
              ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]
```

`strategy` is `left-join` (default), `right-join`, `inner-join`, or `full-join`. Join conditions accept
only the comparison operators — no `between`, no `and`/`or` wrappers.

## Multi-stage queries

A second stage consumes the first stage's output. Use one whenever you need to filter or aggregate
*after* aggregating — "products with more than 10 orders", "average daily revenue by month".

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
   "aggregation": [["count", {}]],
   "breakout": [["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]]]},
  {"lib/type": "mbql.stage/mbql",
   "filters": [[">", {}, ["field", {}, "count"], 10]]}]
```

Later stages reference the previous stage's columns by **machine name as a plain string** — never a
portable array, never the display label:

- An aggregation's output name is the bare function: `count`, `sum`, `avg`, `max`. A second `max` in
  the same stage is `max_2`.
- A breakout keeps the source column's name even when bucketed: a month breakout of `CREATED_AT` is
  still `CREATED_AT`.

## Saved questions, models, metrics, measures, segments

Query a saved card with `source-card` and its 21-character `entity_id` (from `search` or
`get_content`), and reference its columns by output name:

```json
{"lib/type": "mbql.stage/mbql",
 "source-card": "T4wA_GPFwGb6R4FxIDGTo",
 "filters": [[">", {}, ["field", {}, "total"], 100]],
 "limit": 50}
```

Metrics, measures, and segments are *clauses*, never sources. Put their base table in `source-table`
and reference them by `entity_id`:

```json
"aggregation": [["metric", {}, "aB3cD4eF5gH6iJ7kL8mN9"]]
"aggregation": [["measure", {}, "<entity_id>"]]
"filters":     [["segment", {}, "<entity_id>"]]
```

Never invent an `entity_id`. Copy it verbatim from a tool response.

## When a query is rejected

The error names the path (`/stages/0/filters/0/1`) and the rule. The usual causes, in order:

1. A missing `{}` options map.
2. A field reference that isn't a 4-segment portable array — or one whose names don't match what
   `browse_data` reported.
3. A clause head that's really a stage key: `aggregation`, `filters`, `breakout`, and `order-by` are
   *containers*, never operators.
4. Ordering by an inline aggregation that doesn't exactly match the entry in `aggregation` — use the
   index form instead.
5. Date arithmetic with `-`. Use `["datetime-diff", {}, <a>, <b>, "day"]`.
