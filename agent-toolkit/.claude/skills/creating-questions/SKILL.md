---
name: creating-questions
description: Creates saved questions with visualizations, reusable filter segments, measures, metrics, and runs ad-hoc MBQL or SQL queries in Metabase. Use when saving queries as named questions with charts, defining reusable filters/aggregations, or running exploratory queries.
---

# Creating Questions, Segments, Measures, and Queries

@./../_shared/visualization-settings.md
@./../_shared/field-resolution.md
@./../_shared/mbql-construction.md

## construct-query

Construct an MBQL query by evaluating Clojure code with `metabase.lib` functions. Returns legacy MBQL JSON or (with `--run`) executes the query directly.

```bash
# Return MBQL JSON
./metabase-agent construct-query --database-id <id> --clj '<clojure code>'

# Construct AND execute in one step
./metabase-agent construct-query --database-id <id> --run --clj '<clojure code>'
```

Example:
```bash
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (filter (= (field "ORDERS" "STATUS") "completed"))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month)))'
```

Returns a JSON object like:
```json
{"database": 1, "type": "query", "query": {"source-table": 5, "aggregation": [["sum", ...]], ...}}
```

With `--run`, returns query results (columns, rows, metadata) instead of MBQL JSON.

See the MBQL Construction reference for all available functions and examples.

## create-question

Create a saved question (card) with visualization settings. **Always prefer MBQL** — Metabase can do much more with structured queries (drill-down, auto-filters, column-level metadata, cross-database compatibility). Use SQL only when MBQL can't express the query.

```bash
./metabase-agent create-question --json '<payload>'
```

### MBQL question (structured query — preferred)

First construct the MBQL query with `construct-query`, then use the output as the `query` field:

```json
{
  "name": "Revenue by Month",
  "database_id": 1,
  "query": {"source-table": 5, "aggregation": [["sum", ["field", 23, null]]], "breakout": [["field", 20, {"temporal-unit": "month"}]]},
  "display": "line",
  "visualization": {
    "x_axis": ["CREATED_AT"],
    "y_axis": ["sum"]
  }
}
```

### SQL question (native query — use only when MBQL can't express the query)

```json
{
  "name": "Revenue by Month",
  "database_id": 1,
  "sql": "SELECT DATE_TRUNC('month', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1 ORDER BY 1",
  "display": "line",
  "type": "question",
  "visualization": {
    "x_axis": ["month"],
    "y_axis": ["revenue"],
    "y_axis_label": "Revenue ($)",
    "show_values": true
  },
  "collection_id": 7,
  "description": "Monthly revenue trend"
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | | Question name |
| `database_id` | yes | | Database ID |
| `sql` | one of sql/query | | SQL query (native question) |
| `query` | one of sql/query | | MBQL query object from `construct-query` |
| `display` | no | `"table"` | Chart type (see visualization-settings.md) |
| `type` | no | `"question"` | `"question"`, `"model"`, or `"metric"` |
| `visualization` | no | | Chart settings (see visualization-settings.md) |
| `collection_id` | no | | Save to specific collection |
| `description` | no | | Question description |

Exactly one of `sql` or `query` must be provided.

Output:
```json
{"id": 42, "name": "Revenue by Month", "display": "line", "type": "question"}
```

The returned `id` is the `card_id` you pass to dashboard commands.

### Example: Line chart (MBQL — recommended)

Two-step workflow: first construct the MBQL, then create the question.

```bash
# Step 1: Construct MBQL query
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month)))'
# --> returns {"database": 1, "type": "query", "query": {...}}

# Step 2: Create question with the MBQL output as the "query" field
./metabase-agent create-question --json '{
  "name": "Revenue Trend",
  "database_id": 1,
  "query": <paste output from step 1>,
  "display": "line",
  "visualization": {"x_axis": ["CREATED_AT"], "y_axis": ["sum"]}
}'
```

For MBQL questions, `visualization.y_axis` uses the aggregation operator name (`sum`, `count`, `avg`, etc.), not SQL aliases.

### Example: Top 10 bar chart (MBQL with ordering)

```bash
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (field "ORDERS" "STATUS"))
      (order-by (desc (sum (field "ORDERS" "TOTAL"))))
      (limit 10))'
```

### Example: Pie chart (MBQL)

```bash
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (aggregate (count))
      (breakout (field "ORDERS" "STATUS")))'

./metabase-agent create-question --json '{
  "name": "Orders by Status",
  "database_id": 1,
  "query": <paste output>,
  "display": "pie",
  "visualization": {"dimension": ["STATUS"], "metric": "count"}
}'
```

### Example: KPI scalar (MBQL)

```bash
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (aggregate (sum (field "ORDERS" "TOTAL"))))'

./metabase-agent create-question --json '{
  "name": "Total Revenue",
  "database_id": 1,
  "query": <paste output>,
  "display": "scalar"
}'
```

### Example: Metric (reusable aggregation on a card)

Metrics are cards with `type: "metric"`. They define a reusable aggregation:

```bash
./metabase-agent create-question --json '{
  "name": "Total Revenue",
  "database_id": 1,
  "type": "metric",
  "query": {"source-table": 5, "aggregation": [["sum", ["field", 23, null]]]},
  "display": "scalar",
  "description": "Sum of all order totals"
}'
```

### Example: SQL fallback (use only when MBQL can't express the query)

```bash
./metabase-agent create-question --json '{
  "name": "Revenue Trend",
  "database_id": 1,
  "sql": "SELECT DATE_TRUNC('"'"'month'"'"', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1 ORDER BY 1",
  "display": "line",
  "visualization": {"x_axis": ["month"], "y_axis": ["revenue"]}
}'
```

## update-question

```bash
./metabase-agent update-question <id> --json '<payload>'
```

All fields are optional. If updating `sql`, you MUST include `database_id`.

```json
{
  "name": "Updated Name",
  "display": "bar",
  "sql": "SELECT ...",
  "database_id": 1,
  "visualization": {"x_axis": ["month"], "y_axis": ["revenue"], "stack": "stacked"},
  "description": "Updated description"
}
```

## create-segment

Create a reusable filter (segment) on a table using field names.

```bash
./metabase-agent create-segment --json '<payload>'
```

Full JSON template:
```json
{
  "name": "Active Users",
  "table_id": 5,
  "filters": [
    {"field": "last_login", "op": "greater-than", "value": "2024-01-01"},
    {"field": "status", "op": "equals", "value": "active"}
  ],
  "description": "Users active in 2024"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Segment name |
| `table_id` | yes | Table ID |
| `filters` | yes (min 1) | Filter conditions using field names |
| `description` | no | Segment description |

Multiple filters are ANDed together automatically. Field names are resolved to IDs via the table's metadata (see field-resolution.md).

### Filter Operations

| Operation | Description | Needs value? |
|-----------|-------------|-------------|
| `equals` | Exact match | yes |
| `not-equals` | Not equal | yes |
| `greater-than` | > | yes |
| `greater-than-or-equal` | >= | yes |
| `less-than` | < | yes |
| `less-than-or-equal` | <= | yes |
| `contains` | String contains | yes |
| `not-contains` | Does not contain | yes |
| `starts-with` | String starts with | yes |
| `ends-with` | String ends with | yes |
| `is-null` | Value is null | no |
| `is-not-null` | Value is not null | no |
| `is-empty` | Empty string | no |
| `is-not-empty` | Not empty string | no |

Use `values` (array) instead of `value` for multi-value matching.

Output:
```json
{"id": 10, "name": "Active Users", "table_id": 5}
```

## update-segment

```bash
./metabase-agent update-segment <id> --json '<payload>'
```

```json
{
  "name": "Updated Name",
  "description": "New description",
  "table_id": 5,
  "filters": [{"field": "status", "op": "equals", "value": "active"}],
  "revision_message": "Updated filter criteria"
}
```

If updating `filters`, you MUST include `table_id`. `revision_message` defaults to "Updated via CLI".

## create-measure

Create a reusable aggregation expression (measure) tied to a table. Measures use MBQL definitions with exactly one aggregation.

```bash
./metabase-agent create-measure --json '<payload>'
```

```json
{
  "name": "Total Revenue",
  "table_id": 5,
  "definition": {"database": 1, "type": "query", "query": {"source-table": 5, "aggregation": [["sum", ["field", 23, null]]]}},
  "description": "Sum of all order totals"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Measure name |
| `table_id` | yes | Table ID this measure belongs to |
| `definition` | yes | MBQL5 query object (from `construct-query`) |
| `description` | no | Measure description |

Workflow: Use `construct-query` to build the MBQL, then pass the output as `definition`.

Output:
```json
{"id": 3, "name": "Total Revenue", "table_id": 5}
```

## list-measures

```bash
./metabase-agent list-measures
```

Output:
```json
[{"id": 3, "name": "Total Revenue", "table_id": 5, "description": "Sum of all order totals"}]
```

## get-measure

```bash
./metabase-agent get-measure <id>
```

## update-measure

```bash
./metabase-agent update-measure <id> --json '<payload>'
```

```json
{
  "name": "Updated Name",
  "definition": {"database": 1, "type": "query", "query": {"source-table": 5, "aggregation": [["avg", ["field", 23, null]]]}},
  "revision_message": "Changed from sum to avg"
}
```

`revision_message` defaults to "Updated via CLI".

## execute-query

Run ad-hoc queries without saving. Prefer `construct-query --run` for MBQL — it's simpler. Use `execute-query` when you already have a raw query object or need SQL.

```bash
./metabase-agent execute-query --json '<payload>'
```

### MBQL execution (preferred — or use `construct-query --run` instead)

```json
{
  "database_id": 1,
  "query": {"source-table": 5, "aggregation": [["count"]], "filter": ["=", ["field", 50, null], "completed"]}
}
```

### SQL execution (use only when MBQL can't express the query)

```json
{
  "database_id": 1,
  "sql": "SELECT COUNT(*) AS total_orders FROM orders WHERE status = 'completed'"
}
```

Exactly one of `sql` or `query` must be provided.

Output:
```json
{
  "status": "completed",
  "columns": [{"name": "total_orders", "display_name": "Total Orders", "base_type": "type/Integer"}],
  "rows": [[1523]],
  "row_count": 1,
  "running_time": 245,
  "_meta": {"truncated": false, "total_count": 1, "returned_count": 1}
}
```

Default max 50 rows. Override with `--max-rows 200`. Results are ephemeral -- use `create-question` to save.

## run-question

Run a saved question and return sample results.

```bash
./metabase-agent run-question <id>
./metabase-agent run-question <id> --max-rows 20
```

Default: 10 rows. Use this to verify a question works before adding it to a dashboard, or to inspect the data shape.

Output:
```json
{"card_id": 42, "status": "completed",
 "columns": [{"name": "month", "display_name": "Month", "base_type": "type/DateTime"},
              {"name": "revenue", "display_name": "Revenue", "base_type": "type/Float"}],
 "rows": [["2024-01-01T00:00:00Z", 12345.67]],
 "row_count": 12, "running_time": 150,
 "_meta": {"truncated": true, "total_count": 12, "returned_count": 10}}
```

## Gotchas

- **Always use MBQL** unless the query requires SQL-specific features (CTEs, window functions, database-specific syntax, etc.). MBQL questions support drill-down, auto-filters, and cross-database compatibility that SQL questions cannot provide.
- `create-question` returns `id` -- this is the `card_id` for dashboard commands
- **MBQL y_axis**: Use aggregation operator names: `"y_axis": ["sum"]`, `"y_axis": ["sum", "count"]`. Duplicates get suffixes: `sum_2`, `sum_3`
- **SQL y_axis**: Column aliases must match `x_axis`/`y_axis` exactly: `SELECT SUM(total) AS revenue` means `"y_axis": ["revenue"]`
- For pie charts, use `dimension` and `metric`, not `x_axis`/`y_axis`
- `type: "model"` creates a Metabase model (queryable like a table)
- `type: "metric"` creates a reusable metric aggregation
- Segment field names are resolved against table metadata. Run `get-table <table_id>` first to confirm field names.
- `execute-query` does NOT save anything. Use `create-question` for persistent results.
- MBQL queries from `construct-query` include the full `dataset_query` structure -- pass the entire output as the `query` field.
- Measures require MBQL definitions -- use `construct-query` to build them.
- Use `construct-query --run` to test MBQL queries ad-hoc without creating a saved question.
