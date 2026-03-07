---
name: creating-questions
description: Creates saved questions with visualizations, reusable filter segments, and ad-hoc SQL queries in Metabase. Use when saving SQL as a named question with a chart, defining reusable filters on tables, or running exploratory queries.
---

# Creating Questions, Segments, and Queries

@./../_shared/visualization-settings.md
@./../_shared/field-resolution.md

## create-question

Create a saved question (card) from SQL with visualization settings.

```bash
./metabase-agent create-question --json '<payload>'
```

Full JSON template:
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
| `sql` | yes | | SQL query |
| `display` | no | `"table"` | Chart type (see visualization-settings.md) |
| `type` | no | `"question"` | `"question"` or `"model"` |
| `visualization` | no | | Chart settings (see visualization-settings.md) |
| `collection_id` | no | | Save to specific collection |
| `description` | no | | Question description |

Output:
```json
{"id": 42, "name": "Revenue by Month", "display": "line", "type": "question"}
```

The returned `id` is the `card_id` you pass to dashboard commands.

### Example: Line chart

```bash
./metabase-agent create-question --json '{
  "name": "Revenue Trend",
  "database_id": 1,
  "sql": "SELECT DATE_TRUNC('"'"'month'"'"', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1 ORDER BY 1",
  "display": "line",
  "visualization": {"x_axis": ["month"], "y_axis": ["revenue"]}
}'
```

### Example: Pie chart

```bash
./metabase-agent create-question --json '{
  "name": "Orders by Status",
  "database_id": 1,
  "sql": "SELECT status, COUNT(*) AS count FROM orders GROUP BY 1",
  "display": "pie",
  "visualization": {"dimension": ["status"], "metric": "count"}
}'
```

### Example: KPI scalar

```bash
./metabase-agent create-question --json '{
  "name": "Total Revenue",
  "database_id": 1,
  "sql": "SELECT SUM(total) AS revenue FROM orders",
  "display": "scalar"
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

## execute-query

Run ad-hoc SQL without saving.

```bash
./metabase-agent execute-query --json '<payload>'
```

```json
{
  "database_id": 1,
  "sql": "SELECT COUNT(*) AS total_orders FROM orders WHERE status = 'completed'"
}
```

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

- `create-question` returns `id` -- this is the `card_id` for dashboard commands
- Column aliases in SQL must match `x_axis`/`y_axis` exactly: `SELECT SUM(total) AS revenue` means `"y_axis": ["revenue"]`, not `["total"]`
- For pie charts, use `dimension` and `metric`, not `x_axis`/`y_axis`
- `type: "model"` creates a Metabase model (queryable like a table). Metrics use the separate `/api/measure` endpoint (MBQL-based, not supported by this CLI).
- Segment field names are resolved against table metadata. Run `get-table <table_id>` first to confirm field names.
- `execute-query` does NOT save anything. Use `create-question` for persistent results.
