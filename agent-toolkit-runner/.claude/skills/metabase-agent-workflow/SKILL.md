---
name: metabase-agent-workflow
description: Orchestrates the Metabase agent CLI workflow for building analytics from raw data. Use when the goal involves discovering databases, creating transforms, defining questions or segments, or building dashboards.
---

# Metabase Agent Workflow

Build analytics from raw data in four phases:

```
1. Discover  -->  2. Model  -->  3. Define  -->  4. Visualize
```

| Phase | What it does | What it produces |
|-------|-------------|-----------------|
| Discover | Explore databases, tables, fields | database_id, table_id, field names |
| Model | Clean/join/aggregate data with MBQL or SQL transforms | New tables in the database |
| Define | Save MBQL (preferred) or SQL as questions with charts; create segments, measures, metrics | card_id values for dashboards |
| Visualize | Build dashboards with cards and filters | Stakeholder-ready dashboards |

## Command Reference

| Goal | Command | Phase |
|------|---------|-------|
| Find databases and tables | `list-databases --include tables` | Discover |
| Inspect table fields and types | `get-table <id>` | Discover |
| Search existing content | `search "query" --models table,card` | Discover |
| Full database schema | `get-database <id>` | Discover |
| Field metadata + fingerprint | `get-field <id>` | Discover |
| Distinct values for a field | `get-field-values <id>` | Discover |
| Create MBQL/SQL transform | `create-transform --json '{...}'` | Model |
| Inspect transform | `get-transform <id>` | Model |
| List transforms with status | `list-transforms` | Model |
| Check transform run | `get-transform-run <run_id>` | Model |
| Construct MBQL query | `construct-query --database-id <id> --clj '<code>'` | Define |
| Construct + run MBQL | `construct-query --database-id <id> --run --clj '<code>'` | Define |
| Save MBQL/SQL as a chart | `create-question --json '{...}'` | Define |
| Create reusable filter | `create-segment --json '{...}'` | Define |
| Create reusable aggregation | `create-measure --json '{...}'` | Define |
| List all measures | `list-measures` | Define |
| Get measure details | `get-measure <id>` | Define |
| Update a measure | `update-measure <id> --json '{...}'` | Define |
| Run ad-hoc MBQL or SQL | `execute-query --json '{...}'` | Define |
| Run saved question | `run-question <id>` | Define |
| Build dashboard with cards | `create-dashboard --json '{...}'` | Visualize |
| Add card to dashboard | `add-card-to-dashboard --json '{...}'` | Visualize |
| View dashboard layout | `get-dashboard <id>` | Visualize |

## Essential Rules

- **Always use MBQL** for queries. MBQL questions support drill-down, auto-filters, column-level metadata, and cross-database compatibility that SQL questions cannot provide. Use SQL only when MBQL genuinely can't express the query (e.g., CTEs, window functions, database-specific syntax).
- All mutations use `--json '<payload>'` with simplified JSON (not raw API format)
- Field names (like `"created_at"`) are resolved to numeric IDs automatically -- never look up IDs manually
- Queries use MBQL constructed via `construct-query` (preferred) or native SQL (fallback)
- `construct-query --run` lets you construct and execute MBQL in one step (no need to pipe through `execute-query`)
- In MBQL, `table` and `field` accept both string names and numeric IDs: `(table "ORDERS")` or `(table 42)`
- `field` with one argument searches all tables: `(field "total")` — use two args if ambiguous
- Use `--dry-run` before mutations to preview API calls
- Use `--fields id,name` to keep responses compact
- Use `./metabase-agent schema <command>` to see exact JSON Schema for any command

## End-to-End Example (MBQL — recommended)

```bash
# 1. Discover: find the database and inspect tables
./metabase-agent list-databases --include tables --fields id,name
./metabase-agent get-table 5

# 2. Explore: test an MBQL query ad-hoc (construct + execute in one step)
./metabase-agent construct-query --database-id 1 --run --clj '
  (-> (query (table "ORDERS"))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month)))'
# --> returns query results (columns, rows)

# 3. Define: construct MBQL (without --run) to get the query JSON
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (aggregate (sum (field "ORDERS" "TOTAL")))
      (breakout (with-temporal-bucket (field "ORDERS" "CREATED_AT") :month)))'
# --> returns {"database": 1, "type": "query", "query": {...}}

# 4. Define: create question with MBQL result
./metabase-agent create-question --json '{
  "name": "Revenue by Month",
  "database_id": 1,
  "query": <output from construct-query>,
  "display": "line",
  "visualization": {"x_axis": ["CREATED_AT"], "y_axis": ["sum"]}
}'

# 5. Define: create a reusable measure
./metabase-agent construct-query --database-id 1 --clj '
  (-> (query (table "ORDERS"))
      (aggregate (sum (field "ORDERS" "TOTAL"))))'
./metabase-agent create-measure --json '{
  "name": "Total Revenue",
  "table_id": 5,
  "definition": <output from construct-query>
}'

# 6. Visualize: build a dashboard
./metabase-agent create-dashboard --json '{
  "name": "Sales Dashboard",
  "cards": [{"card_id": 42, "width": 24, "height": 6}]
}'
```

## End-to-End Example (SQL — use only when MBQL can't express the query)

```bash
# 1. Discover: find the database and tables
./metabase-agent list-databases --include tables --fields id,name

# 2. Discover: inspect the orders table
./metabase-agent get-table 5

# 3. Define: create a chart question
./metabase-agent create-question --json '{
  "name": "Revenue by Month",
  "database_id": 1,
  "sql": "SELECT DATE_TRUNC('"'"'month'"'"', created_at) AS month, SUM(total) AS revenue FROM orders GROUP BY 1 ORDER BY 1",
  "display": "line",
  "visualization": {"x_axis": ["month"], "y_axis": ["revenue"]}
}'
# --> returns {"id": 42, ...}

# 3b. Verify: run the question and check sample results
./metabase-agent run-question 42

# 4. Visualize: build a dashboard
./metabase-agent create-dashboard --json '{
  "name": "Sales Dashboard",
  "cards": [{"card_id": 42, "width": 24, "height": 6}],
  "filters": [{"name": "Date", "type": "date/range",
    "targets": [{"card_id": 42, "field": "month"}]}]
}'
```

## Checklist

```
- [ ] Discover: identify database_id and table_ids
- [ ] Discover: inspect field names and types with get-table
- [ ] Discover: check field values (get-field-values) for filter fields
- [ ] (Optional) Model: create-transform if raw data needs cleaning
- [ ] Define: construct-query for MBQL (preferred) — use SQL only if MBQL can't express it
- [ ] Define: create-question for each visualization needed
- [ ] Define: (optional) create-segment for reusable filters
- [ ] Define: (optional) create-measure for reusable aggregations
- [ ] Define: (optional) create metric with type: "metric"
- [ ] Visualize: create-dashboard with card_ids from above
- [ ] Visualize: wire dashboard filters to card fields
```

## Detailed Skill References

For complete JSON formats, examples, and gotchas for each command group:

- [Discovering Data](./../discovering-data/SKILL.md) -- databases, tables, search
- [Modeling Transforms](./../modeling-transforms/SKILL.md) -- MBQL/SQL transforms
- [Creating Questions](./../creating-questions/SKILL.md) -- questions, segments, measures, queries, MBQL construction
- [Building Dashboards](./../building-dashboards/SKILL.md) -- dashboards, cards, filters
- [Common Patterns](./../_shared/common-patterns.md) -- setup, global flags, errors
