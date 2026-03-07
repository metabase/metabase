---
name: modeling-transforms
description: Creates and manages SQL transforms that materialize query results into database tables. Use when raw data needs cleaning, joining, or restructuring before building questions and dashboards.
---

# Modeling Transforms

Transforms run SQL and write the results to a new database table. Use them when raw tables need cleaning, joining, or aggregation before downstream analysis.

Do NOT use transforms for: one-off queries (use `execute-query`) or saved questions that just need a chart (use `create-question`).

## create-transform

```bash
./metabase-agent create-transform --json '<payload>'
```

Full JSON template:
```json
{
  "name": "Clean Orders",
  "database_id": 1,
  "sql": "SELECT * FROM orders WHERE status != 'cancelled'",
  "target_table": "clean_orders",
  "target_schema": "transforms",
  "target_database_id": 2,
  "description": "Orders excluding cancelled",
  "run": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Transform name |
| `database_id` | yes | Source database ID |
| `sql` | yes | SQL query for the transform |
| `target_table` | yes | Output table name |
| `target_schema` | no | Schema for output table |
| `target_database_id` | no | Defaults to `database_id` |
| `description` | no | Description |
| `run` | no | Execute immediately after creation |

Example:
```bash
./metabase-agent create-transform --json '{
  "name": "Monthly Revenue",
  "database_id": 1,
  "sql": "SELECT DATE_TRUNC('"'"'month'"'"', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1",
  "target_table": "monthly_revenue",
  "target_schema": "transforms",
  "run": true
}'
```

Output when `run: true`:
```json
{"transform": {"id": 15, "name": "Monthly Revenue"},
 "run": {"status": "succeeded", "run_id": 123}}
```

When `run: true`, the CLI polls until completion (up to 5 minutes) or returns `polling_timeout`.

Output when `run: false` or omitted:
```json
{"id": 15, "name": "Monthly Revenue", "source_type": "query"}
```

## get-transform

Get a transform's full definition including its SQL query, target table, and last run status.

```bash
./metabase-agent get-transform <id>
```

Output:
```json
{
  "id": 15,
  "name": "Clean Orders",
  "description": "Orders excluding cancelled",
  "database_id": 1,
  "sql": "SELECT * FROM orders WHERE status != 'cancelled'",
  "target_table": "clean_orders",
  "target_schema": "transforms",
  "last_run_status": "succeeded",
  "last_run_at": "2024-12-01T10:30:00Z"
}
```

Use this to inspect an existing transform's SQL before updating it.

## list-transforms

```bash
./metabase-agent list-transforms
```

Output:
```json
[{"id": 15, "name": "Clean Orders", "source_type": "query", "last_run_status": "succeeded"}]
```

`last_run_status` values: `succeeded`, `failed`, `running`, `null` (never run).

## get-transform-run

```bash
./metabase-agent get-transform-run <run_id>
```

Check status of a specific run. Terminal statuses: `succeeded`, `failed`, `timeout`, `canceled`.

## update-transform

```bash
./metabase-agent update-transform <id> --json '<payload>'
```

```json
{
  "name": "Updated Name",
  "description": "New description",
  "sql": "SELECT ...",
  "database_id": 1,
  "target_table": "new_table_name",
  "target_schema": "new_schema"
}
```

All fields are optional. If updating `sql`, you MUST include `database_id`.

## Gotchas

- SQL strings with single quotes need shell escaping: `'"'"'` or `'\''`
- `target_table` creates a real table in the target database. Choose names carefully.
- After a transform runs, the output table appears in `list-databases --include tables`
- Transforms are independent of questions. A question can query the transform's output table using regular SQL.
- Transform runs can take time. The `--run` flag polls automatically, but long-running transforms may hit the 5-minute polling timeout. Use `get-transform-run` to check afterward.
