---
name: data-workspace
description: Unified workflow for data analysis and pipeline building in workspaces
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# Data Workspace

This skill provides a unified workflow for data analysis and pipeline building. It detects what the user wants to do and adapts accordingly.

## Two Modes

### Analysis Mode
Triggered by analytical questions. Focus is on answering questions.

**Triggers:**
- "What's the rating variance by reviewer initial?"
- "Show me the top 5 customers by revenue"
- "How many orders were placed last month?"
- "Find users who haven't ordered in 90 days"

**Behavior:**
- Creates files in `questions/` directory
- Runs query and presents results in chat
- May or may not be merged to production
- Focus: answering the question

### Pipeline Mode
Triggered by data modeling requests. Focus is on building reusable transforms.

**Triggers:**
- "Create a table that enriches orders with user and product info"
- "Build cohort tables for retention analysis"
- "Set up a daily active users transform"
- "Create a customer lifetime value model"

**Behavior:**
- Creates files in `transforms/` directory
- Focus is on the transform definition, not immediate results
- Intent is to merge to production
- Building blocks for dashboards/reports

## Workflow

### 1. Understand Context

Read available context:
```bash
cat workspace.yaml
ls tables/
ls questions/ transforms/ 2>/dev/null
```

Read table schemas from `tables/*.yaml` to understand available columns.

### 2. Determine Mode

Based on user's request:
- Questions/inquiries -> Analysis Mode
- Build/create/model requests -> Pipeline Mode

If unclear, ask: "Are you looking to answer a specific question, or build a reusable data model?"

### 3. Write the Query

For SQL:
```sql
-- name: <descriptive name>
-- description: <what this does>
-- target_schema: public
-- target_table: <table_name>

SELECT ...
```

For Python:
```python
# name: <descriptive name>
# source_tables: {"table1": 123, "table2": 456}
# target_table: <table_name>

result = ...
```

### 4. Sync and Test

```bash
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')

curl -s -X POST -H "x-api-key: $API_KEY" \
  "$URL/api/ee/workspace/$WS_ID/transform/$REF_ID/dry-run"
```

### 5. Present Results (Analysis Mode)

Show data in readable format with insights.

### 6. Iterate

Edit file, re-sync, re-run, present updated results.

## Scratch Queries

For quick exploratory queries - don't create files, just dry-run inline.

## API Reference

### Dry Run (preview without persisting)
```
POST /api/ee/workspace/:ws-id/transform/:ref-id/dry-run
```

### Run (persist to isolated table)
```
POST /api/ee/workspace/:ws-id/transform/:ref-id/run
```

### Run All (execute all transforms in order)
```
POST /api/ee/workspace/:ws-id/run
```
