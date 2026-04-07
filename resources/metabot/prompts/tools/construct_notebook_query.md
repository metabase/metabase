Use this tool to construct a notebook query directly from the structured MBQL tuple AST. MBQL (Metabase Query Language) is Metabase's structured, JSON-friendly query AST — this tool builds a query directly in that AST instead of writing SQL.

Return a payload with:
- `source_entity`: `{"type":"table"|"model"|"question"|"metric","id":123}`
- `referenced_entities`: optional additional context entities in the same shape
- `program`: structured MBQL program
- `visualization`: optional chart choice like `{"chart_type":"bar"}`

The program must use the structured source/context pattern:

```json
{
  "source": { "type": "context", "ref": "source" },
  "operations": [
    ["filter", ["between", ["field", 2058], "2024-01-01", "2024-12-31"]],
    ["aggregate", ["sum", ["field", 2056]]],
    ["breakout", ["with-temporal-bucket", ["field", 2058], "month"]]
  ]
}
```

Rules:
- Use real numeric ids only — the integer ids returned by the table/metric detail endpoints.
- Use `["field", id]`, `["table", id]`, `["card", id]`, `["metric", id]`, and `["measure", id]` as needed.
- `program` must be a JSON object, not a quoted JSON string.
- Each item in `operations` must contain exactly one top-level transform.
  - Good: `[["aggregate", ["count"]], ["aggregate", ["sum", ["field", 301]]]]`
  - Bad: `[["aggregate", ["count"], ["sum", ["field", 301]]]]`
- Use `["relative-datetime", n, "unit"]` for relative temporal values.
- `source_entity` chooses the primary source:
  - `table` -> table
  - `model` -> model/dataset
  - `question` -> saved question
  - `metric` -> metric
- Use `{ "type": "context", "ref": "source" }` as the program source for the selected primary source.
- Use nested `{ "type": "program", "program": { ... } }` only when you truly need a derived query as a source or join target.

Common operators:
- `["filter", clause]`
- `["aggregate", aggregation]`
- `["breakout", breakout-form]`
- `["with-fields", [field-or-ref, ...]]`
- `["limit", 10]`
- `["expression", "Name", expr]`
- `["join", join-clause]`
- `["order-by", orderable]`
- `["order-by", orderable, "desc"]`
- `["append-stage"]`
- `["drop-stage"]`
- `["drop-empty-stages"]`
- `["with-page", {"page": 2, "items": 25}]`

Do not put visualization inside `program.operations`.
- Good: top-level `"visualization": {"chart_type": "pie"}`
- Bad: `["visualization", {"chart_type": "pie"}]`

Breakout and ordering rules:
- Do not breakout on the same underlying field twice in one stage.
  - If you breakout by `["with-temporal-bucket", ["field", 2058], "month"]`, do not also breakout by raw `["field", 2058]`.
- If you want the normal ascending order for a breakout field, you can usually omit an explicit `order-by`.
  - Metabase already adds implicit ascending ordering for breakout fields.
  - Add an explicit `order-by` for a breakout only when you need a different direction or a different sort precedence.

Measures and segments:
- Prefer `["measure", id]` when a model/table exposes an official measure that matches the requested aggregation.
- Prefer `["segment", id]` when a model/table exposes an official segment that matches the requested filter.

Post-aggregation logic:
- For filters or expressions that reference `["aggregation-ref", index]`, add `["append-stage"]` first.
- Example:

```json
{
  "source": { "type": "context", "ref": "source" },
  "operations": [
    ["aggregate", ["sum", ["field", 301]]],
    ["breakout", ["field", 401]],
    ["append-stage"],
    ["filter", [">", ["aggregation-ref", 0], 1000]]
  ]
}
```

Grouped ratio example:

```json
{
  "source": { "type": "context", "ref": "source" },
  "operations": [
    ["aggregate", ["sum", ["field", 301]]],
    ["aggregate", ["sum", ["field", 302]]],
    ["breakout", ["field", 401]],
    ["append-stage"],
    ["expression", "Ratio", ["/", ["aggregation-ref", 0], ["aggregation-ref", 1]]],
    ["order-by", ["desc", ["expression-ref", "Ratio"]]],
    ["limit", 10]
  ]
}
```

Joins:
- If a surrounding/related table is already shown in context for the source table, first try using that table's field ids directly without an explicit join.
- Add an explicit join when you need custom join behavior, a join alias, explicit joined-field selection, self-joins, or direct related-field refs do not work.
- Direct related-field refs are the default for one-hop related tables.
- If an explicit join returns a permission error, the underlying table is not accessible — surface the error instead of retrying with implicit refs (they hit the same permission check).
- Example:

```json
{
  "source": { "type": "context", "ref": "source" },
  "operations": [
    ["join", ["with-join-conditions",
      ["join-clause", ["table", 42]],
      [["=", ["field", 101], ["field", 202]]]
    ]],
    ["aggregate", ["sum", ["field", 301]]],
    ["breakout", ["field", 202]]
  ]
}
```

Field projection rules:
- `with-fields` accepts returned columns and refs such as `["field", id]`, `["expression-ref", "Name"]`, and `["aggregation-ref", 0]`.
- Do not define `["expression", "Name", expr]` inside `with-fields`.
  - Define the expression first as its own top-level operation, then project `["expression-ref", "Name"]`.
- For multi-value categorical filters, use `in` or `or`, not `=` with an array literal.
  - Good: `["filter", ["in", ["field", 2492], ["authorized", "pending"]]]`
  - Bad: `["filter", ["=", ["field", 2492], ["authorized", "pending"]]]`
- For temporal extraction, use helpers such as `["get-month", ["field", 2058]]` and `["get-day-of-week", ["field", 2058]]`.
  - Use `["get-hour", ["field", 2058]]` and `["get-quarter", ["field", 2058]]` for hour-of-day or quarter-number extraction.
  - Do not invent helpers or bucket names like `month-of-year`, `quarter-of-year`, `hour-of-day`, or `dayofweek`.
- When filtering extracted quarter values, use numeric quarter numbers `1`, `2`, `3`, `4`, not strings like `"Q1"`.
- When you need the number of days or other units between two temporal values, use `["datetime-diff", left-temporal-expr, right-temporal-expr, "day"]`.
  - Do not subtract dates with `-` to compute date differences.

Use `with-fields` for row-level queries and `breakout` only for grouped results.
If the result should be visualized, set `visualization.chart_type` to something appropriate like `table`, `bar`, `line`, `area`, `pie`, or `scalar`.

Aggregation operators:
- `["count"]` — Count all rows
- `["sum", ["field", id]]` — Sum
- `["avg", ["field", id]]` — Average
- `["min", ["field", id]]` — Minimum
- `["max", ["field", id]]` — Maximum
- `["distinct", ["field", id]]` — Count distinct values
- `["count-where", clause]` — Count rows matching a condition
- `["sum-where", ["field", id], clause]` — Sum for matching rows
- `["median", ["field", id]]` — Median
- `["percentile", ["field", id], 0.95]` — Percentile
- `["measure", id]` — Use a pre-defined measure

Filter operators:
- `["=", field, value]`, `["!=", field, value]`
- `["<", field, value]`, `["<=", field, value]`, `[">", field, value]`, `[">=", field, value]`
- `["between", field, low, high]`
- `["contains", field, "text"]`, `["does-not-contain", field, "text"]`
- `["starts-with", field, "prefix"]`, `["ends-with", field, "suffix"]`
- `["is-null", field]`, `["not-null", field]`, `["is-empty", field]`, `["not-empty", field]`
- `["in", field, [v1, v2, ...]]`, `["not-in", field, [v1, v2, ...]]`
- `["time-interval", field, n, "unit"]` — Relative time window
- `["and", clause1, clause2]`, `["or", clause1, clause2]`, `["not", clause]`
- `["segment", id]` — Pre-defined segment

Expression operators:
- Arithmetic: `["+", a, b]`, `["-", a, b]`, `["*", a, b]`, `["/", a, b]`
- Math: `["abs", x]`, `["ceil", x]`, `["floor", x]`, `["round", x]`, `["power", x, n]`, `["sqrt", x]`
- String: `["concat", a, b]`, `["substring", s, start, len]`, `["replace", s, old, new]`, `["upper", s]`, `["lower", s]`, `["trim", s]`, `["length", s]`
- Conditional: `["case", [[cond1, val1], [cond2, val2]], default]`
- Coalesce: `["coalesce", a, b]`
- Date extraction: `["get-year", field]`, `["get-month", field]`, `["get-day", field]`, `["get-quarter", field]`, `["get-hour", field]`, `["get-day-of-week", field]`
- Date arithmetic: `["datetime-add", field, n, "unit"]`, `["datetime-diff", field1, field2, "unit"]`

References:
- `["field", id]` — Field by database ID
- `["expression-ref", "Name"]` — Custom expression by name
- `["aggregation-ref", 0]` — Aggregation result by 0-based index

Temporal bucketing (for breakout):
- `["with-temporal-bucket", ["field", id], "month"]`
- Valid buckets: `year`, `quarter`, `month`, `week`, `day`, `hour`, `minute`, `second`, `day-of-week`
