---
name: query-dialect
description: The query dialect execute_query and question_write's `query` accept — numeric table/field ids, clause shape, filters, aggregation, breakouts, joins, expressions, multi-stage queries, saved-card sources. Read before authoring any non-trivial query, or on a shape / unknown-id rejection. Triggers — "write an MBQL query", "aggregate and group by", "join two tables", "filter then re-aggregate", "month-over-month", "query a saved question or model".
---

# The query dialect

`execute_query` (`query`) and `question_write` (inline `query`) name every table and column by its **numeric id** — copy ids from `browse_data` (`list_tables`, `get_fields`), never invent or guess one, never hand-write base64. Saved questions, models, metrics, measures, and segments go by **entity_id** (their 21-char id from `search` / `get_content`; numeric also accepted). The server validates, repairs, and resolves against real metadata, and its errors name what didn't resolve.

`get_content`'s `definition` include returns queries in this same shape, so a definition you read can be edited and sent back as-is.

Loop: author → `execute_query` `validate_only: true` (checks shape + ids, mints a `query_handle`, runs nothing) → execute → save via `question_write` with that `query_handle` (saves exactly what ran).

## Shape

Top level: `{"lib/type": "mbql/query", "database": <numeric db id>, "stages": [...]}`. `execute_query` infers `database` from the first stage's source, but `question_write`'s inline `query` requires it — include it.

```json
{"lib/type": "mbql/query",
 "database": 1,
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": 5,
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"}, 42]]}]}
```

- `source-table` (numeric table id) **or** `source-card` (entity_id) — exactly one, **first stage only**; later stages read the previous stage's output implicitly.
- Optional stage keys: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`.

## The two most-violated rules

1. **Every clause is `["op", {}, ...args]` — write the options map at position 1 even when empty.** `["count", {}]`, not `["count"]`. (A missing `{}` is repaired server-side, but write it so your query matches later reads.)
2. **A field ref names its column by numeric id**: `["field", {}, 42]` — the id from `browse_data` `get_fields`. A wrong id that happens to exist resolves to the wrong column *silently*, so copy ids from tool output, never from memory.

In a **later stage**, reference a previous stage's column by its **string machine name**: `["field", {}, "count"]`. An aggregation's output name is the bare function (`count`, `sum`, `avg`; a second `sum` is `sum_2`) unless its options set `"name"`; a breakout keeps the source field's machine name even when bucketed — never use display labels ("Max of Total").

Field options: `temporal-unit` (bucket a datetime: `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"`, …), `binning` (`{"strategy": "num-bins", "num-bins": 10}` for histograms), `join-alias` (required on every explicitly-joined ref), `source-field` (implicit-FK disambiguation, a numeric field id).

## Filters, aggregation, order-by

`filters` entries are implicitly ANDed; nest `["or", {}, …]` for OR.

```json
"filters": [[">", {}, ["field", {}, 40], 100],
            ["=", {}, ["field", {}, 61], "Gadget"]],
"aggregation": [["sum", {"name": "revenue"}, ["field", {}, 40]]],
"order-by": [["desc", {}, ["aggregation", {}, 0]]]
```

- `order-by` wraps a ref in `["asc", {}, ref]` / `["desc", {}, ref]`. Order by a same-stage aggregation with `["aggregation", {}, <0-based index>]` — **never** `["field", {}, "count"]` in the stage that computes it: that shape validates, then fails (or silently misresolves) at execution.
- Filtering **on** an aggregation result (`HAVING`) belongs in a next stage, by output name (see multi-stage below).
- Relative dates: `["time-interval", {}, <field>, -30, "day"]`, `["time-interval", {}, <field>, "current", "month"]`. An explicit year or date range in the request is an **absolute** filter (`between` on dates), not relative.
- Multi-value categorical: `["in", {}, <field>, "a", "b"]` / `["not-in", …]`.
- Full operator catalog: `learn("query-dialect", "operators")`.

## Expressions (custom columns)

```json
"expressions": {"Subtotal": ["+", {}, ["field", {}, 40], ["field", {}, 44]]},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

## Joins

**Implicit FK join** — reference a related table's field directly; with exactly one FK to that table the server fills in the join:

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": 5,
 "aggregation": [["count", {}]],
 "breakout": [["field", {}, 61]]}
```

Ambiguous FK → retry with `{"source-field": <FK field id on the source table>}` on the field. No FK path → explicit join. `browse_data` `get_fields` marks FK columns and targets — check before assuming a column lives on the current table.

**Explicit join**:

```json
"joins": [{"alias": "Products",
           "strategy": "left-join",
           "stages": [{"lib/type": "mbql.stage/mbql", "source-table": 8}],
           "conditions": [["=", {},
             ["field", {}, 43],
             ["field", {"join-alias": "Products"}, 60]]]}],
"breakout": [["field", {"join-alias": "Products"}, 61]]
```

`strategy`: `left-join` (default) / `right-join` / `inner-join` / `full-join`. **Every** joined-column ref carries `{"join-alias": "<alias>"}`, in conditions and downstream alike. Conditions accept only `=`, `!=`, `<`, `<=`, `>`, `>=`.

## Multi-stage queries

Filter on an aggregation's result in a **next** stage, referencing it by output name; ordering by a same-stage aggregation needs no extra stage (`["aggregation", {}, <index>]`):

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

Window function: `offset` sits in `aggregation` and reads another breakout row — month-over-month is `["offset", {"name": "prev_month"}, ["sum", {}, <field>], -1]` against a monthly breakout.

## Saved questions and models as sources

`source-card` takes the card's **21-char entity_id**, copied verbatim from `search` or `get_content` (its numeric id also works) — never guessed. Columns by output **name**:

```json
{"lib/type": "mbql/query",
 "database": 1,
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-card": "T4wA_GPFwGb6R4FxIDGTo",
             "filters": [[">", {}, ["field", {}, "total"], 100]],
             "limit": 50}]}
```

The card must live in the same database as the rest of the query. Never fall back to native `{{#id}}` SQL — `source-card` is the supported path.

## Metrics, measures, segments

Referenced by entity_id (copied verbatim from tool responses; numeric id also works) on a stage whose `source-table` is their base table:

- Metric (saved metric card): `"aggregation": [["metric", {}, "<entity_id>"]]`
- Measure (table-attached aggregation): `"aggregation": [["measure", {}, "<entity_id>"]]`
- Segment (table-attached filter): `"filters": [["segment", {}, "<entity_id>"]]`

`browse_data` `get_fields` lists each table's measures, segments, and metrics with ids. To compose *on top of* one, read its definition via `get_content` (`include: ["definition"]`) — it returns clauses in this dialect you can inline and extend.

## Translating the request

- **A constraint is a filter, not a breakout**: "only/where/for X" → `filters`; reserve `breakout` for "by / per / for each / over time".
- **Apply every stated constraint**; don't drop one because the aggregation is in place.
- **Don't add analysis the user didn't ask for.**

## Don't

- Don't invent or guess ids — copy them from `browse_data` / `search` output. A wrong name errors loudly; a wrong id can silently hit the wrong column.
- Don't use `card__<id>` strings or URIs anywhere — `source-card` takes the bare id.
- Don't omit the `{}` options slot or put options anywhere but position 1.
- Don't put a stage-container key (`aggregation`, `filters`, `breakout`, `limit`) at a clause head — clauses go *inside* those arrays.
- Don't reference a same-stage aggregation by name (`["field", {}, "count"]`) in `order-by` — use `["aggregation", {}, <index>]`; name refs to aggregations are for the *next* stage.
- Don't subtract dates with `-` — use `["datetime-diff", {}, a, b, "day"]`.
- Don't breakout the same field twice in one stage (bucketed and raw).
- Don't reference a previous stage's column by display label — machine name only.
- Don't hand-write base64 — `get_content`'s `definition` include is already in this dialect and can be sent back as-is.
