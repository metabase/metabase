# Construct Query Reference

Construct a Metabase MBQL query from a structured program. The body is the program itself — no envelope — shaped:

```
{"source": {...}, "operations": [...]}
```

Returns `{"query": "<base64>"}` — pass the string to `execute_query`.

IMPORTANT: field IDs must come from entity-detail endpoints (`/v1/table/{id}`, `/v1/metric/{id}`). Do not invent IDs. The backend repairs minor mistakes (aliases, casing, over-wrapping) before validation, but the canonical names below always work.

## Workflow

1. Use `search` and the entity-detail tools (`get_table`, `get_metric`) to find the table/metric/model and its fields.
2. Call `construct_query` with the program. You get back `{"query": "<base64>"}`.
3. Pass that string to `execute_query`.

Never embed IDs you did not read from a metadata endpoint — invented IDs will fail at execution.

## Source

One of `{"type": T, "id": N}`:

- `table` — a database table
- `card` — a saved question
- `dataset` — a model (model card id)
- `metric` — a metric (supplies its own aggregation and time dimension; extra aggregates usually unnecessary)

## Top-level operations (applied in order)

Each operation is `["op", arg, ...]`:

- `["filter", clause]` — add a filter
- `["aggregate", agg-clause]` — add an aggregation
- `["breakout", ref-or-bucketed]` — add a grouping dimension
- `["expression", "Name", expr]` — define a named computed column (reference later with `expression-ref`)
- `["with-fields", [refs...]]` — restrict returned columns
- `["order-by", ref]` or `["order-by", ref, "asc"|"desc"]` — sort
- `["limit", N]` — cap rows
- `["join", join-clause]` — join another entity
- `["append-stage"]` — start a new query stage (needed to filter on aggregated values)
- `["with-page", {"page": N, "items": M}]` — paginate

## References (used as arguments inside operations)

- `["field", N]` — database field by id. Do NOT put options in a third slot (no `["field", id, {...}]`); wrap instead
- `["expression-ref", "Name"]` — a named expression defined earlier
- `["aggregation-ref", N]` — the Nth `aggregate` defined earlier (0-based). REQUIRED when sorting by an aggregated value
- `["measure", N]` — a pre-defined measure on the source entity
- `["with-temporal-bucket", ref, unit]` — temporal bucketing. `unit` is one of: `minute` `hour` `day` `week` `month` `quarter` `year`. Also `day-of-week`, `hour-of-day`, etc. (extraction aliases)
- `["with-binning", ref, {"strategy": "num-bins"|"bin-width"|"default", ...}]` — numeric binning. E.g. `{"strategy": "num-bins", "num-bins": 10}`

## Filter operators

`=`, `!=`, `<`, `<=`, `>`, `>=`, `between`, `in`, `not-in`, `is-null`, `not-null`, `is-empty`, `not-empty`, `contains`, `does-not-contain`, `starts-with`, `ends-with`, `time-interval`, `and`, `or`, `not`, `segment`.

Examples: `["=", ["field", 101], "active"]`, `["between", ["field", 305], "2024-01-01", "2024-12-31"]`, `["in", ["field", 302], [10, 20, 30]]`, `["time-interval", ["field", 305], -7, "day"]`.

## Aggregation operators

`count`, `sum`, `avg`, `min`, `max`, `distinct`, `median`, `stddev`, `var`, `percentile`, `count-where`, `sum-where`, `distinct-where`, `share`, `cum-count`, `cum-sum`.

Examples: `["count"]`, `["sum", ["field", 302]]`, `["count-where", ["=", ["field", 101], "completed"]]`.

## Temporal helpers (for use in `expression` or as grouping)

`get-year`, `get-quarter`, `get-month`, `get-week`, `get-day`, `get-day-of-week`, `get-hour`, `get-minute`, `datetime-add`, `datetime-diff`, `datetime-subtract`, `now`, `today`, `relative-datetime`, `absolute-datetime`, `with-temporal-bucket`, `convert-timezone`.

## Examples

Top 5 customers by revenue:

```
{"source": {"type": "table", "id": 42},
 "operations": [["aggregate", ["sum", ["field", 302]]],
                ["breakout", ["field", 101]],
                ["order-by", ["aggregation-ref", 0], "desc"],
                ["limit", 5]]}
```

Monthly revenue from a metric (metric supplies the aggregation):

```
{"source": {"type": "metric", "id": 10},
 "operations": [["breakout", ["with-temporal-bucket", ["field", 305], "month"]],
                ["order-by", ["with-temporal-bucket", ["field", 305], "month"], "asc"]]}
```

Filter on an aggregated value (requires `append-stage`):

```
{"source": {"type": "table", "id": 42},
 "operations": [["aggregate", ["sum", ["field", 302]]],
                ["breakout", ["field", 101]],
                ["append-stage"],
                ["filter", [">", ["aggregation-ref", 0], 1000]]]}
```

Named expression referenced later:

```
{"source": {"type": "table", "id": 42},
 "operations": [["expression", "Discount", ["-", ["field", 302], ["field", 303]]],
                ["aggregate", ["sum", ["expression-ref", "Discount"]]]]}
```

Previous-period comparison with `offset` (stay in the SAME stage — do NOT add `append-stage`):

```
{"source": {"type": "table", "id": 42},
 "operations": [["aggregate", ["sum", ["field", 302]]],
                ["aggregate", ["offset", ["sum", ["field", 302]], -1]],
                ["breakout", ["with-temporal-bucket", ["field", 305], "month"]]]}
```

## Rules & common pitfalls

Stage boundaries (most common source of errors):

- Filtering on an aggregated value REQUIRES `append-stage` between the aggregate/breakout and the filter (see the "filter on aggregated value" example). Without it, `aggregation-ref` resolution fails in the same stage.
- Defining an `expression` that uses `aggregation-ref` also REQUIRES `append-stage` first.
- EXCEPTION: `offset` (previous-period comparison) stays in the same stage as its base aggregation and breakout — do NOT add `append-stage` for it.

Refs & shapes:

- Aggregation helpers take field refs, not bare IDs: `["sum", ["field", 201]]`, never `["sum", 201]`.
- To sort by an aggregated value, use `["aggregation-ref", N]` — not the original expression.
- Do NOT put options in a third slot of `field` (no `["field", id, {...}]`). Wrap instead: `["with-temporal-bucket", ["field", id], "month"]` or `["with-binning", ["field", id], {...}]`.
- `case` takes `[[condition, value], ...]` branches and an optional bare fallback as the THIRD arg — do not wrap it as `{"default": ...}`. Omit the third arg when there is no fallback.
- JSON objects appear only where a helper explicitly calls for one (e.g. `with-page`, `with-binning`). Everywhere else, use operator tuples.

Joins & related tables:

- If the source table's detail response already surfaces a related table's fields, use those field refs directly — no explicit join needed.
- Reach for `join` + `with-join-conditions` only for custom aliases, self-joins, explicit joined-field selection, or when direct related-field refs are unavailable.
- If an explicit join returns a permission error, the underlying table is not accessible — surface the error, do not retry with implicit refs.

Metrics & dates:

- A `metric` source already provides its own aggregation and time dimension. Add only the additional breakouts/filters you need.
- When the user asks for an exact year (e.g. 2024), use `["=", ["field", year_field], 2024]` or a `between` with explicit dates — not relative filters like `time-interval`.
