---
name: query-dialect
description: The portable MBQL 5 dialect execute_query and question_write's `query` accept — name-based refs, clause shape, filters, aggregation, breakouts, joins, expressions, multi-stage queries, saved-card sources. Read before authoring any non-trivial query, or on a shape / unknown-name rejection. Triggers — "write an MBQL query", "aggregate and group by", "join two tables", "filter then re-aggregate", "month-over-month", "query a saved question or model".
---

# The portable query dialect (MBQL 5)

`execute_query` (`query`) and `question_write` (inline `query`) name every database, table, and column by its **exact name** — never a numeric id, never base64. Discover names with `search` / `browse_data` (`list_tables`, `get_fields`) and copy them verbatim; the server validates, repairs, and resolves against real metadata, and its errors name what didn't resolve.

Loop: author → `execute_query` `validate_only: true` (checks shape + names, mints a `query_handle`, runs nothing) → execute → save via `question_write` with that `query_handle` (saves exactly what ran).

## Shape

Top level: `{"lib/type": "mbql/query", "stages": [...]}` — no `database` key; it's inferred from the first stage's source.

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"},
                           ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]}]}
```

- `source-table` **or** `source-card` — exactly one, **first stage only**; later stages read the previous stage's output implicitly.
- Optional stage keys: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`.

## The two most-violated rules

1. **Every clause is `["op", {}, ...args]` — write the options map at position 1 even when empty.** `["count", {}]`, not `["count"]`. (A missing `{}` is repaired server-side, but write it so your query matches later reads.)
2. **A field ref names its column with a 4-segment array**: `["field", {}, ["<db-name>", "<schema-or-null>", "<table>", "<column>"]]` — `null` schema slot for schemaless databases (e.g. MongoDB); exact database name (`"Sample Database"`, not `"Sample"`).

In a **later stage**, reference a previous stage's column by its **string machine name**: `["field", {}, "count"]`. An aggregation's output name is the bare function (`count`, `sum`, `avg`; a second `sum` is `sum_2`) unless its options set `"name"`; a breakout keeps the source field's machine name even when bucketed — never use display labels ("Max of Total").

Field options: `temporal-unit` (bucket a datetime: `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"`, …), `binning` (`{"strategy": "num-bins", "num-bins": 10}` for histograms), `join-alias` (required on every explicitly-joined ref), `source-field` (implicit-FK disambiguation).

## Filters, aggregation, order-by

`filters` entries are implicitly ANDed; nest `["or", {}, …]` for OR.

```json
"filters": [[">", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]], 100],
            ["=", {}, ["field", {}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]], "Gadget"]],
"aggregation": [["sum", {"name": "revenue"}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]]],
"order-by": [["desc", {}, ["aggregation", {}, 0]]]
```

- `order-by` wraps a ref in `["asc", {}, ref]` / `["desc", {}, ref]`; same-stage aggregations by `["aggregation", {}, <0-based index>]`.
- Relative dates: `["time-interval", {}, <field>, -30, "day"]`, `["time-interval", {}, <field>, "current", "month"]`. An explicit year or date range in the request is an **absolute** filter (`between` on dates), not relative.
- Multi-value categorical: `["in", {}, <field>, "a", "b"]` / `["not-in", …]`.
- Full operator catalog: `learn("query-dialect", "operators")`.

## Expressions (custom columns)

```json
"expressions": {"Subtotal": ["+", {},
                             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]],
                             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TAX"]]]},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

## Joins

**Implicit FK join** — reference a related table's field directly; with exactly one FK to that table the server fills in the join:

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
 "aggregation": [["count", {}]],
 "breakout": [["field", {}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]}
```

Ambiguous FK → the error lists candidates; retry with `{"source-field": ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]}` on the field. No FK path → explicit join. `browse_data` `get_fields` marks FK columns and targets — check before assuming a column lives on the current table.

**Explicit join**:

```json
"joins": [{"alias": "Products",
           "strategy": "left-join",
           "stages": [{"lib/type": "mbql.stage/mbql",
                       "source-table": ["Sample Database", "PUBLIC", "PRODUCTS"]}],
           "conditions": [["=", {},
             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]],
             ["field", {"join-alias": "Products"}, ["Sample Database", "PUBLIC", "PRODUCTS", "ID"]]]]}],
"breakout": [["field", {"join-alias": "Products"}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]
```

`strategy`: `left-join` (default) / `right-join` / `inner-join` / `full-join`. **Every** joined-column ref carries `{"join-alias": "<alias>"}`, in conditions and downstream alike. Conditions accept only `=`, `!=`, `<`, `<=`, `>`, `>=`.

## Multi-stage queries

You can't filter or order by an aggregation in the stage that computes it — add a stage:

```json
"stages": [
  {"lib/type": "mbql.stage/mbql",
   "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
   "aggregation": [["count", {}]],
   "breakout": [["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]]]},
  {"lib/type": "mbql.stage/mbql",
   "filters": [[">", {}, ["field", {}, "count"], 10]],
   "order-by": [["desc", {}, ["field", {}, "count"]]]}
]
```

Window function: `offset` sits in `aggregation` and reads another breakout row — month-over-month is `["offset", {"name": "prev_month"}, ["sum", {}, <field>], -1]` against a monthly breakout.

## Saved questions and models as sources

`source-card` takes the card's **21-char entity_id**, copied verbatim from `search` or `get_content` — never a numeric id, never guessed. Columns by output **name**:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-card": "T4wA_GPFwGb6R4FxIDGTo",
             "filters": [[">", {}, ["field", {}, "total"], 100]],
             "limit": 50}]}
```

The card must live in the same database as the rest of the query. Never fall back to native `{{#id}}` SQL — `source-card` is the supported path.

## Metrics, measures, segments

Referenced by opaque entity_id (21-char, copied verbatim from tool responses) on a stage whose `source-table` is their base table:

- Metric (saved metric card): `"aggregation": [["metric", {}, "<entity_id>"]]`
- Measure (table-attached aggregation): `"aggregation": [["measure", {}, "<entity_id>"]]`
- Segment (table-attached filter): `"filters": [["segment", {}, "<entity_id>"]]`

`browse_data` `get_fields` lists each table's measures, segments, and metrics with ids. To compose *on top of* one, read its definition via `get_content` (`include: ["definition"]`) — it returns clauses in this dialect you can inline and extend.

## Translating the request

- **A constraint is a filter, not a breakout**: "only/where/for X" → `filters`; reserve `breakout` for "by / per / for each / over time".
- **Apply every stated constraint**; don't drop one because the aggregation is in place.
- **Don't add analysis the user didn't ask for.**

## Don't

- Don't use numeric ids, `card__<id>` strings, or `metabase://` URIs anywhere — names and entity_ids only.
- Don't omit the `{}` options slot or put options anywhere but position 1.
- Don't put a stage-container key (`aggregation`, `filters`, `breakout`, `limit`) at a clause head — clauses go *inside* those arrays.
- Don't subtract dates with `-` — use `["datetime-diff", {}, a, b, "day"]`.
- Don't breakout the same field twice in one stage (bucketed and raw).
- Don't reference a previous stage's column by display label — machine name only.
- Don't hand-write base64 or numeric-ref internal MBQL — `get_content`'s `definition` include is already in this dialect and can be sent back as-is.
