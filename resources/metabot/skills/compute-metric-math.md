---
id: compute-metric-math
title: Metric math — combine metrics with arithmetic
description: Combining saved metrics/measures with +, -, *, / into one visualization (optionally broken out by a shared dimension) using compute_metric_math — load before building a metric-math formula so you get the expression shape, the breakout rules, and the cross-table limits right.
tools: [compute_metric_math]
priority: 60
---
# Metric math

`compute_metric_math` combines **saved metrics and measures** with arithmetic (`+ - * /`) into a single
visualization — e.g. `Revenue / Headcount`, `(Budget − Spend) / Budget * 100`. It builds a chart the
**user** sees; it does **not** return the computed numbers to you. Describe what it shows; never invent
the underlying values.

Use it when the user wants to derive a value by combining **existing** metrics/measures. For a query
over raw tables/fields, or a per-dimension breakout that metric math can't do (see limits below), use
`construct_notebook_query` instead.

## Inputs

- **`expression`** — a tree. Each node is one of:
  - a reference: `{ "type": "metric", "id": 42 }` (or `"measure"`). Optionally `"filter"`: an MBQL
    filter clause scoped to that reference.
  - an arithmetic node: `{ "op": "/", "operands": [ <expr>, <expr>, ... ] }`, `op` ∈ `+ - * /`.
    Nesting sets precedence. Operands may be references, nested nodes, or bare numbers.
  - a number constant, e.g. `100`.
  - The whole expression must reference **at least one** metric or measure.
- **`breakout`** *(optional)* — `{ "field_id": 351, "temporal_unit": "month" }`. Groups the result by a
  dimension. See the rules below — this is where most failures come from. Omit it for a single scalar.
- **`display`** *(optional)* — `line` (default), `bar`, `area`, `row`, `table`, or `scalar`.
- **`title`** — short, human-friendly; shown above the chart.

### Example — budget variance %, by month

```json
{
  "title": "Budget variance % by department",
  "display": "bar",
  "expression": {
    "op": "*",
    "operands": [
      { "op": "/", "operands": [
        { "op": "-", "operands": [ {"type":"metric","id":79}, {"type":"metric","id":83} ] },
        {"type":"metric","id":79} ] },
      100 ]
  },
  "breakout": { "field_id": 351, "temporal_unit": "month" }
}
```

## Breakout rules (read before adding a breakout)

**Every metric in the formula must expose the breakout field as one of its own dimensions.** The field
is matched by its underlying **field id**, so:

1. **Get the field id from the metric's own dimensions** — read `entity_details` for each metric (or the
   metadata tools) and use a `field_id` listed under *that* metric's queryable dimensions. Do **not** reuse
   a field id you saw on a different metric.
2. **Same name ≠ same field.** Two tables can each have a `created_at` or `department_name` column; they
   are **different fields with different ids**. Picking one table's field id for a metric on another table
   will fail. The error will name the field's table and the metric that lacks it — read it and pick the
   right id.
3. **Cross-table breakouts only work via a conformed dimension** — i.e. the *same physical field* is
   reachable from every metric (e.g. all metrics join to one shared date or entity table). If the metrics
   live on different base tables with no shared field, a breakout cannot be resolved.

## Limitations

- **Breakouts need a field shared by every metric.** A breakout resolves to one physical field that must
  be a dimension on all metrics in the formula. Metrics on **different base tables** can only be broken out
  by a conformed dimension (the same field reachable from each) — including for time: there is no breaking
  two metrics on different tables out by each table's own date column. For a cross-table breakout, drop it
  for a **scalar** result, or use `construct_notebook_query` to build the per-dimension breakout explicitly.
- **Overlap only.** Results include a bucket only when **every** metric has data for it — non-overlapping
  dimension values (e.g. months only one metric covers) are dropped.
- **Missing / divide-by-zero → empty.** A bucket where any operand is missing, or a division by zero,
  produces no value (a gap), not an error.
- **Metrics/measures only.** Operands are saved metrics/measures by id — not raw tables, columns, or
  ad-hoc aggregations. Build those with `construct_notebook_query`.

## Best practices

- **Discover first.** Fetch each metric/measure's id and its dimension `field_id`s via `entity_details`
  (or metadata tools) before calling — don't guess ids.
- **Prefer a scalar when a breakout isn't essential.** Scalars work across any tables; add a breakout only
  when the metrics share the dimension.
- **On a breakout error**, the message tells you exactly which metric lacks the field and what table the
  field belongs to. Fix the id, switch to the conformed field, or drop the breakout — don't retry the same
  id.
- **Present the result** to the user (the chart is theirs); summarize what it represents without stating
  specific numbers you don't have.
