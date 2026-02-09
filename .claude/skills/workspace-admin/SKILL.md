---
name: workspace-admin
description: Initialize analysis projects and merge to production (superuser operations)
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# Workspace Admin

This skill handles superuser operations for data workspace projects:
- **`/new-workspace`** - Create a new analysis project with workspace
- **`/merge-workspace`** - Merge workspace to production and archive

## Bootstrap Setup

This skill must be installed globally to bootstrap new projects:

```bash
mkdir -p ~/.claude/skills/workspace-admin
# Copy this SKILL.md to ~/.claude/skills/workspace-admin/SKILL.md
```

After that, you can run `/new-workspace` from any directory to create a new analysis project.

## Prerequisites

You need a **superuser API key** to use this skill. This is different from the workspace service user key that gets generated for day-to-day operations.

## Commands

### `/new-workspace` - Initialize a New Analysis Project

Creates a new analysis project directory with:
- Workspace created via Metabase API
- Local directory structure for files
- `.env` with the workspace's service user API key
- Skills written into the project (self-contained)

**Workflow:**

1. Ask user for:
   - Project name (will be used for directory and workspace name)
   - Metabase URL (default: http://localhost:3000)
   - Superuser API key
   - Database ID (optional - can be set when first transform is created)

2. Create workspace via API:
   ```bash
   curl -s -X POST \
     -H "x-api-key: $SUPERUSER_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name": "PROJECT_NAME"}' \
     "$METABASE_URL/api/ee/workspace/"
   ```

3. Extract the `api_key` from the response - this is the service user key for the workspace (only returned at creation time).

4. Create directory structure and write all files (see templates below)

5. Output success message with next steps.

**Example:**
```
User: /new-workspace
Assistant: I'll help you create a new analysis project.

What would you like to name this project?
User: customer-churn-analysis

What's your Metabase URL? (default: http://localhost:3000)
User: http://localhost:3000

Please provide your superuser API key:
User: mb_superuser_abc123...

Creating workspace...
Created workspace ID 2856 with service user API key.

Creating project directory structure...
Done!

Your project is ready at ./customer-churn-analysis

Next steps:
  cd customer-churn-analysis
  claude

Then ask questions or build transforms!
```

### `/merge-workspace` - Merge to Production

Merges all transforms from the workspace to production and archives the workspace.

**Workflow:**

1. Read workspace.yaml to get workspace ID and Metabase URL
2. Prompt for superuser API key
3. Call merge endpoint:
   ```bash
   curl -s -X POST \
     -H "x-api-key: $SUPERUSER_KEY" \
     -H "Content-Type: application/json" \
     -d '{"commit-message": "Merged from analysis project"}' \
     "$METABASE_URL/api/ee/workspace/$WS_ID/merge"
   ```
4. Report results and update workspace.yaml status

---

## File Templates for /new-workspace

When running `/new-workspace`, create these files in the project directory:

### Directory Structure
```
PROJECT_NAME/
├── .claude/
│   └── skills/
│       ├── workspace-admin/
│       │   ├── SKILL.md
│       │   └── fetch_table.py    # Table metadata fetcher
│       ├── workspace-files/SKILL.md
│       ├── workspace-sync/SKILL.md
│       └── data-workspace/SKILL.md
├── .env
├── .gitignore
├── workspace.yaml
├── tables/
├── questions/
└── transforms/
```

### .gitignore
```
.env
```

### .env
```
METABASE_API_KEY=<api_key from workspace creation response>
```

### workspace.yaml
```yaml
id: <workspace_id>
name: "<project_name>"
database_id: <database_id or null>
status: uninitialized
metabase_url: <url>
```

### .claude/skills/workspace-files/SKILL.md

```markdown
---
name: workspace-files
description: Manage local file representations of transforms and table schemas
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Workspace Files

Manages local files in a data workspace project.

## SQL File Format (questions/*.sql or transforms/*.sql)

```sql
-- name: Revenue by Customer Segment
-- description: Calculates total revenue grouped by customer segment
-- target_schema: public
-- target_table: revenue_by_segment
-- ref_id: lucid-ferret-a852

SELECT
    c.segment,
    COUNT(DISTINCT o.customer_id) AS customer_count,
    SUM(o.total) AS total_revenue
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'completed'
GROUP BY c.segment
ORDER BY total_revenue DESC
```

## Python File Format (transforms/*.py)

```python
# name: Customer Cohort Analysis
# description: Assigns customers to monthly cohorts
# source_tables: {"orders": 1042, "customers": 1015}
# target_schema: public
# target_table: customer_cohorts
# ref_id: gentle-fox-b123

import pandas as pd

first_purchase = orders_df.groupby('customer_id')['created_at'].min().reset_index()
first_purchase['cohort'] = pd.to_datetime(first_purchase['created_at']).dt.to_period('M')
result = customers_df.merge(first_purchase, left_on='id', right_on='customer_id')
```

## Table Schema (tables/*.yaml)

```yaml
name: orders
schema: public
database_id: 19
table_id: 1042
columns:
  - name: id
    type: integer
  - name: customer_id
    type: integer
  - name: total
    type: decimal
  - name: created_at
    type: timestamp
```

## Header Fields
- `name` (required): Human-readable name
- `description` (optional): What this does
- `target_schema` (required): Target schema name
- `target_table` (required): Target table name
- `ref_id` (auto): Assigned by API after sync - DO NOT set manually
- `source_tables` (Python only): JSON map of dataframe name to table ID
```

### .claude/skills/workspace-sync/SKILL.md

```markdown
---
name: workspace-sync
description: Sync local transform files with the workspace API
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Workspace Sync

Syncs local files with the Metabase workspace API.

## Behavior
- Local files are source of truth
- New files (no ref_id): POST to create, write back ref_id
- Existing files (has ref_id): PUT to update
- Deleted files: DELETE from API

## Reading Configuration

```bash
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2-)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
DB_ID=$(grep '^database_id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
```

## Syncing a SQL File

```bash
FILE="questions/q01_revenue.sql"
NAME=$(grep '^-- name:' "$FILE" | sed 's/^-- name: //')
SCHEMA=$(grep '^-- target_schema:' "$FILE" | sed 's/^-- target_schema: //')
TABLE=$(grep '^-- target_table:' "$FILE" | sed 's/^-- target_table: //')
REF_ID=$(grep '^-- ref_id:' "$FILE" | sed 's/^-- ref_id: //')
SQL=$(sed -n '/^[^-]/,$p' "$FILE" | jq -Rs .)

JSON='{"name":"'"$NAME"'","source":{"type":"query","query":{"type":"native","native":{"query":'"$SQL"'},"database":'"$DB_ID"'}},"target":{"type":"table","schema":"'"$SCHEMA"'","name":"'"$TABLE"'"}}'

if [ -z "$REF_ID" ]; then
  RESP=$(curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d "$JSON" "$URL/api/ee/workspace/$WS_ID/transform")
  NEW_REF=$(echo "$RESP" | jq -r '.ref_id')
  # Add ref_id to file header
else
  curl -s -X PUT -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -d "$JSON" "$URL/api/ee/workspace/$WS_ID/transform/$REF_ID"
fi
```
```

### .claude/skills/data-workspace/SKILL.md

```markdown
---
name: data-workspace
description: Unified workflow for data analysis and pipeline building
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

# Data Workspace

Autonomous workflow. Execute the FULL loop without prompting:
1. Discover tables - fetch metadata, save to `tables/*.yaml`
2. Write file with proper headers
3. Sync to workspace API
4. Run the transform
5. Present results

## Configuration

```bash
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2-)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
DB_ID=$(grep '^database_id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
```

## Step 1: Discover Tables

Before writing queries, fetch metadata for relevant tables:

```bash
# List all tables
python3 ~/.claude/skills/workspace-admin/fetch_table.py --list

# Fetch specific table by name
python3 ~/.claude/skills/workspace-admin/fetch_table.py --name orders

# Fetch all tables
python3 ~/.claude/skills/workspace-admin/fetch_table.py --all
```

## File Formats

### SQL
```sql
-- name: Revenue by Segment
-- target_schema: public
-- target_table: revenue_by_segment

SELECT segment, SUM(total) as revenue FROM orders GROUP BY segment
```

### Python
```python
# name: Customer Cohorts
# source_tables: {"orders": 1042, "customers": 1015}
# target_schema: public
# target_table: customer_cohorts

result = customers_df.merge(orders_df, on='customer_id')
```

## API

- Create: `POST /api/ee/workspace/:ws/transform`
- Update: `PUT /api/ee/workspace/:ws/transform/:ref`
- Run: `POST /api/ee/workspace/:ws/transform/:ref/run`
```

### .claude/skills/workspace-admin/SKILL.md

Copy this entire file into the project so users can run `/merge-workspace` from within the project.

---

## API Reference

### Create Workspace
```
POST /api/ee/workspace/
Headers: x-api-key: <superuser_key>
Body: {"name": "...", "database_id": <optional>}
Response: {
  "id": 123,
  "name": "...",
  "status": "uninitialized",
  "api_key": "mb_..."  // Only on creation!
}
```

### Merge Workspace
```
POST /api/ee/workspace/:id/merge
Headers: x-api-key: <superuser_key>
Body: {"commit-message": "..."}
```

### Archive Workspace
```
POST /api/ee/workspace/:id/archive
Headers: x-api-key: <superuser_key>
```
