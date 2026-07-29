---
name: query-dialect
description: The portable MBQL 5 dialect that execute_query and question_write's `query` accept — name-based refs, the universal clause shape, filters, aggregation, breakouts, joins, expressions, multi-stage queries, and querying saved cards. Read before authoring any non-trivial query, or when a query is rejected with a shape or unknown-name error. Triggers — "write an MBQL query", "aggregate and group by", "join two tables", "filter then re-aggregate", "month-over-month", "query a saved question or model".
---

# The portable query dialect (MBQL 5)

`execute_query` (the `query` argument) and `question_write` (the inline `query` source) speak the **portable external dialect**: every database, table, and column is named by its **exact name**, never a numeric id, never base64. Discover names first — `search`, `browse_data` (`list_tables`, `get_fields`) — and copy them verbatim; never invent identifiers. The server validates, repairs, and resolves the query against real metadata, and its errors name what didn't resolve.

The usual loop: author → `execute_query` with `validate_only: true` (checks shape and names, mints a `query_handle`, runs nothing) → execute → save via `question_write` with the returned `query_handle`, which guarantees you save exactly what ran.

## The shape

Top level: `{"lib/type": "mbql/query", "stages": [...]}` — no `database` key; the database is inferred from the first stage's source. Each stage:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"},
                           ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]]]}]}
```

- `source-table` **or** `source-card` — exactly one, **first stage only**. Later stages read the previous stage's output implicitly.
- Optional per-stage keys: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`.

## The two most-violated rules

1. **Every clause is `["op", {}, ...args]` — write the options map at position 1 even when empty.** `["count", {}]`, not `["count"]`. (The server repairs a missing `{}`, but write it — your query should match what later reads show.)
2. **A field ref names its column with a 4-segment array**: `["field", {}, ["<db-name>", "<schema-or-null>", "<table>", "<column>"]]`. Schemaless databases (e.g. MongoDB) use `null` in the schema slot. Use the exact database name (`"Sample Database"`, not `"Sample"`).

In a **later stage**, refer to a column the previous stage produced by its **string machine name** instead: `["field", {}, "count"]`, `["field", {}, "CREATED_AT"]`. An aggregation's output name is the bare function name (`count`, `sum`, `avg`; a second `sum` is `sum_2`) unless you set `"name"` in its options; a breakout keeps the source field's machine name even when bucketed.

Useful field options: `temporal-unit` (bucket a datetime: `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"`, …), `binning` (`{"strategy": "num-bins", "num-bins": 10}` for numeric histograms), `join-alias` (required on every ref to an explicitly joined column), `source-field` (implicit FK join disambiguation).

## Filters, aggregation, order-by

`filters` entries are implicitly ANDed; nest `["or", {}, …]` for OR.

```json
"filters": [[">", {}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]], 100],
            ["=", {}, ["field", {}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]], "Gadget"]],
"aggregation": [["sum", {"name": "revenue"}, ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]]]],
"order-by": [["desc", {}, ["aggregation", {}, 0]]]
```

- `order-by` wraps a ref in `["asc", {}, ref]` / `["desc", {}, ref]`. To order by an aggregation in the same stage, use `["aggregation", {}, <0-based index>]`.
- Relative dates: `["time-interval", {}, <field>, -30, "day"]` (last 30 days), `["time-interval", {}, <field>, "current", "month"]`. An explicit year or date range in the request is an **absolute** filter (`between` on dates), not a relative one.
- Multi-value categorical: `["in", {}, <field>, "a", "b"]` / `["not-in", …]`.
- The full operator catalog (filters, aggregations, expressions, temporal units) is `learn("query-dialect", "operators")`.

## Expressions (custom columns)

```json
"expressions": {"Subtotal": ["+", {},
                             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TOTAL"]],
                             ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "TAX"]]]},
"aggregation": [["sum", {}, ["expression", {}, "Subtotal"]]]
```

Reference by name with `["expression", {}, "<Name>"]`.

## Joins

**Implicit FK join** — reference a field on a related table directly; when the source has exactly one FK to that table the server fills in the join:

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": ["Sample Database", "PUBLIC", "ORDERS"],
 "aggregation": [["count", {}]],
 "breakout": [["field", {}, ["Sample Database", "PUBLIC", "PRODUCTS", "CATEGORY"]]]}
```

Ambiguous FK → the error lists the candidates; retry with `{"source-field": ["Sample Database", "PUBLIC", "ORDERS", "PRODUCT_ID"]}` on the field. No FK path → use an explicit join. `browse_data` `get_fields` marks FK columns and their targets — check before assuming a column lives on the current table.

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

`strategy`: `left-join` (default) / `right-join` / `inner-join` / `full-join`. **Every** ref to a joined column carries `{"join-alias": "<alias>"}`, in conditions and downstream alike. Join conditions accept only `=`, `!=`, `<`, `<=`, `>`, `>=`.

## Multi-stage queries

You can't filter or order by an aggregation in the stage that computes it — add a stage. Later stages omit the source and reference previous output by string name:

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

`source-card` takes the card's **21-char entity_id**, copied verbatim from `search` or `get_content` — never a numeric id, never guessed. Columns of the card are referenced by output **name**:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-card": "T4wA_GPFwGb6R4FxIDGTo",
             "filters": [[">", {}, ["field", {}, "total"], 100]],
             "limit": 50}]}
```

The card must live in the same database as the rest of the query. Never fall back to native `{{#id}}` SQL for this — `source-card` is the supported path.

## Metrics, measures, segments

Reusable definitions are referenced by opaque id, on a stage whose `source-table` is their base table:

- Metric (a saved metric card): `"aggregation": [["metric", {}, "<entity_id>"]]`
- Measure (table-attached aggregation): `"aggregation": [["measure", {}, "<entity_id>"]]`
- Segment (table-attached filter): `"filters": [["segment", {}, "<entity_id>"]]`

Entity_ids are 21-char strings copied verbatim from tool responses — never invented.

`browse_data` `get_fields` lists each table's measures, segments, and metrics with their ids. To compose *on top of* one (extra filter, different breakout), read its definition with `get_content` (`include: ["definition"]`) — it comes back as clauses in this same dialect you can inline and extend.

## Translating the request

- **A constraint is a filter, not a breakout.** "only/where/for X" → `filters`; reserve `breakout` for "by / per / for each / over time".
- **Apply every stated constraint**; don't drop one because the aggregation is already in place.
- **Don't add analysis the user didn't ask for.**

## Don't

- Don't use numeric ids, `card__<id>` strings, or `metabase://` URIs anywhere in a query — names and entity_ids only.
- Don't omit the `{}` options slot, and don't put the options anywhere but position 1.
- Don't put a stage-container key (`aggregation`, `filters`, `breakout`, `limit`) at a clause head — clauses go *inside* those arrays.
- Don't subtract dates with `-` — use `["datetime-diff", {}, a, b, "day"]`.
- Don't breakout on the same field twice in one stage (e.g. bucketed and raw).
- Don't reference a previous stage's column by its display label ("Max of Total") — use the machine name (`max`).
- Don't hand-write base64 or numeric-ref internal MBQL — if you got such a query from `get_content`'s `definition` include, it is already in the portable dialect and can be sent back as-is.
