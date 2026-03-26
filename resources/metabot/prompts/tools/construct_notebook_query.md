**Program format:**

The `program` parameter is a structured query program with two keys:
- `source`: identifies the data source
- `operations`: an ordered array of operations to apply

```json
{
  "source": {"type": "table", "id": 42},
  "operations": [
    ["filter", ["time-interval", ["field", 305], -12, "month"]],
    ["aggregate", ["sum", ["field", 302]]],
    ["breakout", ["with-temporal-bucket", ["field", 305], "month"]],
    ["order-by", ["field", 305]],
    ["limit", 100]
  ]
}
```

**Source types:**
- `{"type": "table", "id": 42}` — Query a database table
- `{"type": "metric", "id": 10}` — Query a pre-defined metric (has built-in aggregation)
- `{"type": "card", "id": 5}` — Query a saved question or model

**IMPORTANT**: Always prefer metrics over tables when a relevant metric exists. Metrics are business-validated calculations.

---

## Operations reference

Each operation is an array: `["operation-name", arg1, arg2, ...]`. Operations are applied in order.

### Top-level operations

| Operation | Syntax | Description |
|-----------|--------|-------------|
| filter | `["filter", clause]` | Add a filter condition |
| aggregate | `["aggregate", aggregation]` | Add an aggregation (sum, count, avg, etc.) |
| breakout | `["breakout", breakout-form]` | Group results by a dimension |
| with-fields | `["with-fields", [field-refs...]]` | Select specific fields to return |
| expression | `["expression", "Name", expr]` | Define a custom calculated column |
| order-by | `["order-by", orderable]` or `["order-by", orderable, "desc"]` | Sort results |
| limit | `["limit", 10]` | Limit number of rows |
| join | `["join", join-clause]` | Join another table |
| append-stage | `["append-stage"]` | Start a new query stage (required before filtering on aggregation results) |

### Field references

- `["field", 302]` — Reference a field by its integer ID (from entity details)
- `["expression-ref", "Net Amount"]` — Reference a custom expression by name
- `["aggregation-ref", 0]` — Reference an aggregation result by index (0-based)

### Temporal bucketing

Wrap a field reference to apply temporal grouping:
- `["with-temporal-bucket", ["field", 305], "month"]`

Valid buckets: `year`, `quarter`, `month`, `week`, `day`, `hour`, `minute`, `second`, `day-of-week`, `day-of-month`, `month-of-year`, `quarter-of-year`, `hour-of-day`

### Filter operators

**Comparison:**
- `["=", ["field", 301], "value"]` — Equals
- `["!=", ["field", 301], "value"]` — Not equals
- `["<", ["field", 302], 100]` — Less than
- `["<=", ["field", 302], 100]` — Less than or equal
- `[">", ["field", 302], 100]` — Greater than
- `[">=", ["field", 302], 100]` — Greater than or equal
- `["between", ["field", 302], 10, 100]` — Between two values (inclusive)

**String:**
- `["contains", ["field", 303], "text"]` — Contains substring
- `["does-not-contain", ["field", 303], "text"]` — Does not contain
- `["starts-with", ["field", 303], "prefix"]` — Starts with
- `["ends-with", ["field", 303], "suffix"]` — Ends with

**Null/empty checks:**
- `["is-null", ["field", 301]]` — Is null
- `["not-null", ["field", 301]]` — Is not null
- `["is-empty", ["field", 303]]` — Is empty string
- `["not-empty", ["field", 303]]` — Is not empty

**Set membership:**
- `["in", ["field", 301], [1, 2, 3]]` — Value is in list
- `["not-in", ["field", 301], [1, 2, 3]]` — Value is not in list

**Temporal:**
- `["time-interval", ["field", 305], -30, "day"]` — Relative time window (last 30 days)
- `["time-interval", ["field", 305], -12, "month"]` — Last 12 months
- `["time-interval", ["field", 305], 0, "month"]` — Current month
- `["time-interval", ["field", 305], -1, "year"]` — Last year

**Logical combinators:**
- `["and", clause1, clause2]` — Both conditions must be true
- `["or", clause1, clause2]` — Either condition can be true
- `["not", clause]` — Negate a condition

**Segments (pre-defined filters):**
- `["segment", 5]` — Apply a pre-defined segment by ID

### Aggregation operators

- `["count"]` — Count all rows
- `["sum", ["field", 302]]` — Sum of a field
- `["avg", ["field", 302]]` — Average
- `["min", ["field", 302]]` — Minimum
- `["max", ["field", 302]]` — Maximum
- `["distinct", ["field", 301]]` — Count distinct values
- `["count-where", clause]` — Count rows matching a condition
- `["sum-where", ["field", 302], clause]` — Sum field for rows matching condition
- `["median", ["field", 302]]` — Median
- `["percentile", ["field", 302], 0.95]` — Percentile
- `["measure", 5]` — Use a pre-defined measure by ID

### Expression operators (for custom calculations)

**Arithmetic:** `["+", a, b]`, `["-", a, b]`, `["*", a, b]`, `["/", a, b]`
**Math:** `["abs", x]`, `["ceil", x]`, `["floor", x]`, `["round", x]`, `["power", x, n]`, `["sqrt", x]`, `["log", x]`, `["exp", x]`
**String:** `["concat", a, b]`, `["substring", s, start, len]`, `["replace", s, old, new]`, `["upper", s]`, `["lower", s]`, `["trim", s]`, `["length", s]`
**Conditional:** `["case", [[condition1, result1], [condition2, result2]], default]`
**Coalesce:** `["coalesce", a, b]` — First non-null value
**Date:** `["get-year", ["field", 305]]`, `["get-month", ...]`, `["get-day", ...]`, `["get-quarter", ...]`, `["get-hour", ...]`, `["datetime-add", ["field", 305], 1, "month"]`, `["datetime-diff", field1, field2, "day"]`

### Joins

```json
["join", ["join-clause", ["table", 43],
          ["with-join-conditions", [["=", ["field", 301], ["field", 401]]]],
          ["with-join-strategy", "left-join"]]]
```

**Note:** If a related table's fields are already available through implicit joins (shown in entity details), use those field IDs directly without an explicit join. Only use explicit joins for self-joins, custom conditions, or when implicit access doesn't work.

---

## Key patterns

### Post-aggregation filtering (HAVING equivalent)

To filter on aggregation results, use `append-stage` to start a new stage:

```json
{
  "source": {"type": "table", "id": 42},
  "operations": [
    ["aggregate", ["count"]],
    ["breakout", ["field", 303]],
    ["append-stage"],
    ["filter", [">", ["aggregation-ref", 0], 10]]
  ]
}
```

### Custom expressions

```json
{
  "source": {"type": "table", "id": 42},
  "operations": [
    ["expression", "Net Amount", ["-", ["field", 302], ["field", 306]]],
    ["with-fields", [["field", 301], ["expression-ref", "Net Amount"]]],
    ["order-by", ["expression-ref", "Net Amount"], "desc"],
    ["limit", 20]
  ]
}
```

### Ordering by aggregation

```json
{
  "source": {"type": "table", "id": 42},
  "operations": [
    ["aggregate", ["sum", ["field", 302]]],
    ["breakout", ["field", 303]],
    ["order-by", ["desc", ["aggregation-ref", 0]]],
    ["limit", 10]
  ]
}
```

### Metric query with filters

```json
{
  "source": {"type": "metric", "id": 10},
  "operations": [
    ["filter", ["time-interval", ["field", 305], -12, "month"]],
    ["breakout", ["with-temporal-bucket", ["field", 305], "month"]]
  ]
}
```

---

## Visualization

You must provide a `visualization.chart_type` value:

**For aggregations and metrics:**
- Time series (grouped by date/time) -> `line` or `area`
- Categorical aggregations -> `bar`
- Percentage breakdowns -> `pie`
- Single numeric result -> `scalar`

**For raw data:** `table`

**Important:** Don't default to `table` for aggregated data. Use visual charts to show aggregations effectively.
Metabase will automatically map data to chart aesthetics. You only choose the chart type.

---

## When NOT to use this tool

- User explicitly requests SQL -> Use SQL tools
- Complex multi-source analysis requiring raw SQL -> Use SQL tools
