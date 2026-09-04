---
name: query-dialect
description: The query dialect execute_query and question_write's `query` accept — numeric table/field ids, clause shape, filters, aggregation, breakouts, joins, expressions, multi-stage queries, saved-card sources. Read before authoring any non-trivial query, or on a shape / unknown-id rejection. Triggers — "write an MBQL query", "aggregate and group by", "join two tables", "filter then re-aggregate", "month-over-month", "query a saved question or model".
---

# The query dialect

**MBQL or SQL?** MBQL (`execute_query`) for anything that will sit on a filtered dashboard, anything with a date/category/FK filter, every plain aggregate, breakout, or join — MBQL cards wire to dashboard filters as-is; a raw-SQL card must be rewritten with template tags first. SQL (`execute_sql`) for window functions, CTEs, set operations, engine-specific functions, or when the user asks for SQL. Unsure: start in MBQL — the server validates it and names what didn't resolve.

Everything — tables, columns, saved questions, models, metrics, measures, segments — is named by **numeric id**, copied from `browse_data` (`list_tables`, `get_fields`), `search`, or `get_content`; never invented. A wrong name errors loudly; a wrong id that exists resolves to the wrong column *silently*. `get_content`'s `definition` include returns this same shape, so a read definition can be edited and sent back.

Loop: author → `execute_query` `validate_only: true` (shape + ids, mints a `query_handle`, runs nothing) → execute → `question_write` with that `query_handle` (saves exactly what ran).

## Shape

`{"lib/type": "mbql/query", "database": <db id>, "stages": [...]}`. `execute_query` infers `database` from the first stage; `question_write`'s inline `query` requires it — include it.

```json
{"lib/type": "mbql/query",
 "database": 1,
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": 5,
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"}, 42]]}]}
```

- First stage only: `source-table` (table id) **or** `source-card` (card id), exactly one; later stages read the previous stage's output.
- Optional stage keys: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`.

## Two rules

1. **Every clause is `["op", {}, ...args]`** — options map at position 1 even when empty: `["count", {}]`, never `["count"]`. (Repaired server-side, but write it so your query matches later reads.) Never put a stage key (`aggregation`, `filters`, …) at a clause head — clauses go inside those arrays.
2. **A field ref is `["field", {}, <numeric id>]`.** In a later stage, reference a previous stage's column by its **machine name**: `["field", {}, "count"]`. An aggregation's output name is the bare function (`count`, `sum`, `avg`; a second `sum` is `sum_2`) unless its options set `"name"`; a breakout keeps the field's machine name even when bucketed. Never a display label ("Max of Total").

Field options: `temporal-unit` (`"day"`, `"week"`, `"month"`, `"quarter"`, `"year"`, …), `binning` (`{"strategy": "num-bins", "num-bins": 10}` for histograms), `join-alias` (required on every explicitly-joined ref), `source-field` (implicit-FK disambiguation, a field id). Don't breakout the same field twice in one stage (bucketed and raw).

## Filters, aggregation, order-by

`filters` entries are ANDed; nest `["or", {}, …]` for OR.

```json
"filters": [[">", {}, ["field", {}, 40], 100],
            ["=", {}, ["field", {}, 61], "Gadget"]],
"aggregation": [["sum", {"name": "revenue"}, ["field", {}, 40]]],
"order-by": [["desc", {}, ["aggregation", {}, 0]]]
```

- `order-by`: `["asc"|"desc", {}, ref]`. A same-stage aggregation is `["aggregation", {}, <0-based index>]` — **never** `["field", {}, "count"]` in the stage that computes it (validates, then fails or misresolves at execution); name refs to aggregations are for the next stage.
- `HAVING` (filter on an aggregation) goes in a next stage, by output name (below).
- Relative dates: `["time-interval", {}, <field>, -30, "day"]`, `["time-interval", {}, <field>, "current", "month"]`. An explicit year or date range is an **absolute** `between`, not relative.
- Multi-value: `["in", {}, <field>, "a", "b"]` / `["not-in", …]`.
- Date arithmetic: `["datetime-diff", {}, a, b, "day"]`, never `-`.
- Full catalog: `learn("query-dialect", "operators")`.

## Expressions

```json
"expressions": {"Subtotal": ["+", {}, ["field", {}, 40], ["field", {}, 44]]},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

## Joins

**Implicit FK join** — reference the related table's field directly; with exactly one FK path the server fills in the join (`browse_data` `get_fields` marks FK columns and targets — check before assuming a column lives on the current table):

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": 5,
 "aggregation": [["count", {}]],
 "breakout": [["field", {}, 61]]}
```

Ambiguous FK → add `{"source-field": <FK field id on the source table>}` to the ref. No FK path → explicit join:

```json
"joins": [{"alias": "Products",
           "strategy": "left-join",
           "stages": [{"lib/type": "mbql.stage/mbql", "source-table": 8}],
           "conditions": [["=", {},
             ["field", {}, 43],
             ["field", {"join-alias": "Products"}, 60]]]}],
"breakout": [["field", {"join-alias": "Products"}, 61]]
```

`strategy`: `left-join` (default) / `right-join` / `inner-join` / `full-join`. **Every** joined-column ref carries `{"join-alias": "<alias>"}`, in conditions and downstream. Conditions accept only `=`, `!=`, `<`, `<=`, `>`, `>=`.

## Multi-stage

Filter on an aggregation's result in the next stage, by output name:

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": 5,
   "aggregation": [["count", {}]],
   "breakout": [["field", {}, 43]]},
  {"lib/type": "mbql.stage/mbql",
   "filters": [[">", {}, ["field", {}, "count"], 10]],
   "order-by": [["desc", {}, ["field", {}, "count"]]]}
]
```

Window: `offset` sits in `aggregation` and reads another breakout row — month-over-month is `["offset", {"name": "prev_month"}, ["sum", {}, <field>], -1]` against a monthly breakout.

## Saved questions and models as sources

`source-card` takes the card's numeric id — never `card__<id>`, URI refs, or entity_ids — and its columns go by output name. The card must be in the same database as the rest of the query. Never fall back to native `{{#id}}` SQL.

```json
{"lib/type": "mbql/query",
 "database": 1,
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-card": 137,
             "filters": [[">", {}, ["field", {}, "total"], 100]],
             "limit": 50}]}
```

## Metrics, measures, segments

By numeric id, on a stage whose `source-table` is their base table: metric `"aggregation": [["metric", {}, 42]]`; measure `"aggregation": [["measure", {}, 7]]`; segment `"filters": [["segment", {}, 3]]`. `browse_data` `get_fields` lists each table's with ids. To compose on top of one, `get_content` `include: ["definition"]` returns its clauses in this dialect to inline and extend.

## Translating the request

- "only / where / for X" is a **filter**; "by / per / for each / over time" is a **breakout**.
- Apply every stated constraint; add no analysis the user didn't ask for.

## Don't

- Don't guess ids — a wrong id that exists resolves to the wrong column with no error.
- Don't order by a same-stage aggregation by name (`["field", {}, "count"]`) — `["aggregation", {}, <index>]`; name refs are for the next stage.
- Don't omit the `{}` options slot — the server repairs it, so your query stops matching later reads.
- Don't reference a previous stage's column by display label ("Max of Total") — machine name only.
- Don't turn "only / where X" into a breakout, or drop a stated constraint once the aggregation is in place.
