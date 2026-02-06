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
│       ├── workspace-admin/SKILL.md
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

## File Formats

### SQL Transform (questions/*.sql or transforms/*.sql)
```sql
-- name: Rating Variance by Initial
-- description: Analyzes rating variance
-- target_schema: public
-- target_table: rating_variance_by_initial
-- ref_id: lucid-ferret-a852

SELECT ...
```

### Python Transform (transforms/*.py)
```python
# name: User Order Summary
# source_tables: {"users": 1015, "orders": 1042}
# target_table: user_order_summary
# ref_id: gentle-fox-b123

result = users_df.merge(orders_df, on='user_id')
```

### Table Schema (tables/*.yaml)
```yaml
name: orders
schema: public
database_id: 19
table_id: 1042
columns:
  - name: id
    type: integer
  - name: total
    type: decimal
```

## Header Fields
- `name` (required): Human-readable name
- `description` (optional): What this does
- `target_schema` (optional): Target schema
- `target_table` (required): Target table name
- `ref_id` (auto): Assigned by API after sync
- `source_tables` (Python only): Map of df name to table ID
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

## Usage

Read config:
```bash
API_KEY=$(grep METABASE_API_KEY .env | cut -d= -f2)
WS_ID=$(grep '^id:' workspace.yaml | awk '{print $2}')
URL=$(grep '^metabase_url:' workspace.yaml | awk '{print $2}')
```

Create transform:
```bash
curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"...","source":{...},"target":{...}}' \
  "$URL/api/ee/workspace/$WS_ID/transform"
```

Update transform:
```bash
curl -s -X PUT -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"...","source":{...},"target":{...}}' \
  "$URL/api/ee/workspace/$WS_ID/transform/$REF_ID"
```

## Building Request Body

SQL file to API request:
```json
{
  "name": "...",
  "source": {
    "type": "query",
    "query": {
      "type": "native",
      "native": {"query": "SELECT ..."},
      "database": 19
    }
  },
  "target": {"type": "table", "schema": "public", "name": "..."}
}
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

Workflow for data analysis and pipeline building.

## Two Modes

### Analysis Mode
Triggered by questions: "What's the variance?", "Show top 5..."
- Creates files in `questions/`
- Shows results in chat

### Pipeline Mode
Triggered by: "Create a table that...", "Build cohort tables..."
- Creates files in `transforms/`
- Focus on reusable data models

## Workflow

1. Read context: `workspace.yaml`, `tables/*.yaml`
2. Write SQL/Python with header comments
3. Sync to workspace
4. Dry-run to test: `POST .../transform/$REF_ID/dry-run`
5. Present results (analysis) or confirm definition (pipeline)

## Scratch Queries

For quick checks - don't create files, just dry-run inline.

## API

- Dry-run: `POST /api/ee/workspace/:ws/transform/:ref/dry-run`
- Run: `POST /api/ee/workspace/:ws/transform/:ref/run`
- Run all: `POST /api/ee/workspace/:ws/run`
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
