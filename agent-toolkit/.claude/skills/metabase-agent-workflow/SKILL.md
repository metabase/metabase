---
name: metabase-agent-workflow
description: Orchestrates the Metabase agent CLI workflow for building analytics from raw data. Use when the goal involves discovering databases, creating SQL transforms, defining questions or segments, or building dashboards.
---

# Metabase Agent Workflow

Build analytics from raw data in four phases:

```
1. Discover  -->  2. Model  -->  3. Define  -->  4. Visualize
```

| Phase | What it does | What it produces |
|-------|-------------|-----------------|
| Discover | Explore databases, tables, fields | database_id, table_id, field names |
| Model | Clean/join/aggregate data with SQL transforms | New tables in the database |
| Define | Save SQL as questions with charts; create segments | card_id values for dashboards |
| Visualize | Build dashboards with cards and filters | Stakeholder-ready dashboards |

## Command Reference

| Goal | Command | Phase |
|------|---------|-------|
| Find databases and tables | `list-databases --include tables` | Discover |
| Inspect table fields and types | `get-table <id>` | Discover |
| Search existing content | `search "query" --models table,card` | Discover |
| Full database schema | `get-database <id>` | Discover |
| Create SQL transform | `create-transform --json '{...}'` | Model |
| Inspect transform SQL | `get-transform <id>` | Model |
| List transforms with status | `list-transforms` | Model |
| Check transform run | `get-transform-run <run_id>` | Model |
| Save SQL as a chart | `create-question --json '{...}'` | Define |
| Create reusable filter | `create-segment --json '{...}'` | Define |
| Run ad-hoc SQL | `execute-query --json '{...}'` | Define |
| Run saved question | `run-question <id>` | Define |
| Build dashboard with cards | `create-dashboard --json '{...}'` | Visualize |
| Add card to dashboard | `add-card-to-dashboard --json '{...}'` | Visualize |
| View dashboard layout | `get-dashboard <id>` | Visualize |

## Essential Rules

- All mutations use `--json '<payload>'` with simplified JSON (not raw API format)
- Field names (like `"created_at"`) are resolved to numeric IDs automatically -- never look up IDs manually
- All queries use native SQL -- no MBQL, no Python
- Use `--dry-run` before mutations to preview API calls
- Use `--fields id,name` to keep responses compact
- Use `./metabase-agent schema <command>` to see exact JSON Schema for any command

## End-to-End Example

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
- [ ] (Optional) Model: create-transform if raw data needs cleaning
- [ ] Define: create-question for each visualization needed
- [ ] Define: (optional) create-segment for reusable filters
- [ ] Visualize: create-dashboard with card_ids from above
- [ ] Visualize: wire dashboard filters to card fields
```

## Detailed Skill References

For complete JSON formats, examples, and gotchas for each command group:

- [Discovering Data](./../discovering-data/SKILL.md) -- databases, tables, search
- [Modeling Transforms](./../modeling-transforms/SKILL.md) -- SQL transforms
- [Creating Questions](./../creating-questions/SKILL.md) -- questions, segments, queries
- [Building Dashboards](./../building-dashboards/SKILL.md) -- dashboards, cards, filters
- [Common Patterns](./../_shared/common-patterns.md) -- setup, global flags, errors
