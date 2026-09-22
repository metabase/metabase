---
id: megabot-query
title: Structured warehouse queries
description: How to write the MBQL 5 queries run_warehouse_query takes — numeric-id references, filters and relative dates, grouping by time, sorting and limits, joins, later stages, models, and metrics.
profiles: [megabot]
---
## Structured warehouse queries

`run_warehouse_query` takes an MBQL 5 query that names everything by numeric id. Table ids and, on a small
instance, field ids (`name #<field id>`) are under "This instance"; model and metric ids are under "Metrics and
models"; anything else comes from `query_app_db` (see "Finding warehouse tables and columns"). Never guess an id: a
wrong id that exists resolves to the wrong column without an error.

The examples use two tables, in the notation of "This instance": `3 PUBLIC.ORDERS: PRODUCT_ID #9 →
PUBLIC.PRODUCTS.ID, USER_ID #11, TOTAL #12, TAX #13, CREATED_AT #14` and `8 PUBLIC.PRODUCTS: ID #30 (PK), CATEGORY
#32, VENDOR #40`.

Orders per month:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": 3,
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"}, 14]]}]}
```

- The first stage names the source, exactly one of: `source-table` (a table id) or `source-card` (the id of a
  model, saved question, or metric). There's no `database` key: it's inferred from the source.
- Other stage keys: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, `order-by`, `limit`.
- Every clause is `["<op>", {}, ...args]`, with an options map at position 1 even when it's empty: `["count", {}]`,
  never `["count"]`.
- A column is `["field", {}, <field id>]`. On a model or saved question, and in a later stage, reference it by name
  instead: `["field", {}, "TOTAL"]`, `["field", {}, "count"]`.
- This isn't legacy MBQL: no `type`/`query` wrapper, no `filter` key, no `"card__<id>"` strings.

### Filters

`filters` entries are ANDed. Nest `["or", {}, <a>, <b>]` for OR.

```json
"filters": [[">", {}, ["field", {}, 12], 100],
            ["in", {}, ["field", {}, 32], "Gadget", "Widget"],
            ["contains", {"case-sensitive": false}, ["field", {}, 40], "acme"]]
```

- Relative dates, from today:
  - the last 30 days, not counting today: `["time-interval", {}, <field>, -30, "day"]`
  - including today: `["time-interval", {"include-current": true}, <field>, -30, "day"]`
  - this month: `["time-interval", {}, <field>, "current", "month"]`
  - last quarter: `["time-interval", {}, <field>, "last", "quarter"]`
- A named period is absolute, not relative: `["between", {}, <field>, "2024-01-01", "2024-12-31"]` for 2024,
  `["during", {}, <field>, "2024-03-01", "month"]` for March 2024.
- Missing values: `["is-null", {}, <field>]`, `["not-null", …]`; for text, `["is-empty", …]`, `["not-empty", …]`.

### Aggregation and grouping

- `["count", {}]`, `["sum", {}, <field>]`, `["avg", …]`, `["min", …]`, `["max", …]`, `["distinct", {}, <field>]`
  (count of distinct values), `["count-where", {}, <filter>]`, `["share", {}, <filter>]`. Load the
  `megabot-query-operators` skill for the full catalog.
- `breakout` groups rows. Group by time with a `temporal-unit` on a date column: `day`, `week`, `month`, `quarter`,
  and `year` truncate the date; `day-of-week`, `month-of-year`, and `hour-of-day` extract a number. Don't group by
  the same column twice in one stage.
- An aggregation's output is named `count`, `sum`, `avg`, and so on (`sum_2` for a second sum). Set another name
  with `["sum", {"name": "revenue"}, <field>]` when a later stage refers to it.

### Sorting and limits

- `"order-by": [["desc", {}, <ref>]]`, where `<ref>` is a column or, for an aggregation of the same stage,
  `["aggregation", {}, <0-based index>]`. Never order by `["field", {}, "count"]` in the stage that computes it.
- "Top 10 X by Y" is an `order-by` on the aggregation plus `"limit": 10` in the stage. The stage `limit` is part of
  the query and of what show_result renders. The tool's `row_limit` only caps the preview you read.

### Joins

Implicit: reference a column of a related table directly, and the foreign key is followed for you. "This instance"
marks foreign keys as `name #<id> → schema.table.column`. Revenue by product category, from the orders table:

```json
{"lib/type": "mbql.stage/mbql",
 "source-table": 3,
 "aggregation": [["sum", {}, ["field", {}, 12]]],
 "breakout": [["field", {}, 32]]}
```

When several foreign keys lead to that table, pick one: `["field", {"source-field": <FK field id>}, 32]`.

Explicit, when no foreign key links the tables or you need another join type:

```json
"joins": [{"alias": "Products",
           "strategy": "left-join",
           "stages": [{"lib/type": "mbql.stage/mbql", "source-table": 8}],
           "conditions": [["=", {}, ["field", {}, 9], ["field", {"join-alias": "Products"}, 30]]]}],
"breakout": [["field", {"join-alias": "Products"}, 32]]
```

Every reference to a joined column carries `{"join-alias": "<alias>"}`. `strategy` is `left-join`, `inner-join`,
`right-join`, or `full-join`. Conditions use `=`, `!=`, `<`, `<=`, `>`, or `>=`, and reference both columns by field
id, never by name.

### Custom columns and later stages

- `"expressions": {"Net": ["-", {}, ["field", {}, 12], ["field", {}, 13]]}` adds a column, referenced as
  `["expression", {}, "Net"]`. Expressions work row by row, so an aggregation can't go there. Divide aggregations
  inside `aggregation` instead: `["/", {}, ["count-where", {}, <filter>], ["count", {}]]`.
- To filter on an aggregated result (SQL's HAVING), add a stage and reference the output by name:

```json
"stages": [{"lib/type": "mbql.stage/mbql",
            "source-table": 3,
            "aggregation": [["count", {}]],
            "breakout": [["field", {}, 11]]},
           {"lib/type": "mbql.stage/mbql",
            "filters": [[">", {}, ["field", {}, "count"], 5]]}]
```

- Period over period: `["offset", {"name": "previous"}, ["sum", {}, <field>], -1]` in `aggregation`, next to a time
  breakout, is the previous row's value.

### Metrics

A metric under "Metrics and models" is the organization's official definition of a number. Use it rather than
rebuilding it from its definition, so the answer matches, filters included. Put `["metric", {}, <metric id>]` in
`aggregation`, on the source listed next to the metric (`source-table` or `source-card`), and filter or group by that
source's columns as usual. Revenue per week last quarter:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-table": 3,
             "aggregation": [["metric", {}, 42]],
             "filters": [["time-interval", {}, ["field", {}, 14], "last", "quarter"]],
             "breakout": [["field", {"temporal-unit": "week"}, 14]]}]}
```

Metrics that share a source can sit side by side in one `aggregation`. A metric's output column is named after the
aggregation inside it (`sum`, `count`), not after the metric: set `{"name": "revenue"}` in its options when a later
stage refers to it.

### Models and saved questions

Query a model with `"source-card": <model id>` and reference its columns by name:

```json
{"lib/type": "mbql/query",
 "stages": [{"lib/type": "mbql.stage/mbql",
             "source-card": 7,
             "filters": [[">", {}, ["field", {}, "TOTAL"], 100]],
             "aggregation": [["count", {}]],
             "breakout": [["field", {"temporal-unit": "month"}, "CREATED_AT"]]}]}
```

To see a model's columns, run it with `row_limit: 1`: the header lists their names. A name that doesn't exist is
rejected with the list of the names that do.

Foreign keys aren't followed from a model. For a column of a related table, add an explicit join. In its condition,
reference the model's foreign-key column by the id of the field it comes from (here, the orders table's `PRODUCT_ID`,
field 9):

```json
"joins": [{"alias": "Products",
           "stages": [{"lib/type": "mbql.stage/mbql", "source-table": 8}],
           "conditions": [["=", {}, ["field", {}, 9], ["field", {"join-alias": "Products"}, 30]]]}],
"breakout": [["field", {"join-alias": "Products"}, 32]]
```

### Measures and segments

A measure (a saved aggregation) or a segment (a saved filter) belongs to one table. Find them with `query_app_db` on
the `measure` and `segment` tables, and use them on a stage whose `source-table` is their table:
`["measure", {}, <id>]` in `aggregation`, `["segment", {}, <id>]` in `filters`.

### When a query is rejected

The result says what's wrong, and its "To recover" line gives the next step. Fix the query and run it again.
