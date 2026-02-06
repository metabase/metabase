---
name: workspace-transforms
description: Develop and debug workspace transforms, or perform ad-hoc data analysis using the Metabase enterprise API for isolated transform editing, testing, and merging
---

# Workspace Transforms

This skill covers the Metabase workspace and transform APIs -- creating, testing, running, and debugging transforms in isolated workspaces. Use workspaces for developing transform pipelines before merging to production, or for ad-hoc data analysis and exploration.

## Key Rules

**These rules are mandatory. Follow them for every transform operation.**

1. **User questions → Output transforms.** When the user asks a question that produces an answer, create an `Output N: <Title>` transform, NOT a scratch transform. Scratch is only for exploring what data looks like before you know what to ask.

2. **Always build on existing transforms.** Before creating ANY new transform, list existing transforms and check if any already has the data you need. Read from existing transform outputs instead of re-querying source tables.

3. **Never duplicate queries -- extract intermediates eagerly.** If you're about to write a subquery that duplicates logic from another transform, STOP. Extract the shared computation into an intermediate transform first, then have both transforms read from it.

4. **Delete scratch transforms immediately.** After a scratch transform has served its exploratory purpose, delete it before moving on. Don't leave scratch transforms lying around.

5. **Present results in chat.** After running a transform, show the results as an ASCII table in the conversation. The chat is the primary interface; the workspace view is for auditing.

6. **Always specify schema in targets.** Use `"target": { "type": "table", "schema": "public", "name": "..." }` -- don't rely on defaults.

7. **Never reference isolated schemas.** Always use target names (e.g., `FROM cleaned_reviews`). The isolation schema is an internal detail.

8. **Keep JSON on one line.** The entire `-d '{...}'` body must be on a single line. Don't let the JSON wrap mid-string - use `\n` for newlines in SQL, not actual line breaks.

## Getting Started

### What you need a workspace for

Workspaces provide an isolated environment for:
- **Ad-hoc data analysis** -- explore data, run queries, and iterate without affecting production
- **Transform development** -- build and test data pipelines before merging

### Setting up a workspace

**If you don't have a workspace yet:**

1. Check if you have superuser access by attempting to list workspaces:
   ```bash
   curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/"
   ```

2. If you're a superuser, create an empty workspace:
   ```bash
   curl -s -X POST -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
     -d '{"name": "My Analysis Workspace"}' \
     "http://localhost:3000/api/ee/workspace/"
   ```
   The database is determined automatically when you create your first transform.

3. If you're not a superuser (403 error), ask an admin to create a workspace for you and share the workspace ID.

**If you have a workspace:**

Ask the user for:
- Workspace ID
- API key (the user will provide this explicitly)

### Check workspace status

```bash
curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/WS"
```

The workspace should be in `ready` status. Key fields:
- `database_id` -- the database this workspace operates on (set by first transform)
- `status` -- should be `ready` (or `uninitialized` if no transforms yet)

## Data Discovery

Before starting analysis, discover what data is available.

### Find the database from workspace

```bash
# Get workspace info and note the database_id field
curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/WS" | jq .database_id
```

### List available tables

```bash
# Get database metadata with tables (filter to public schema)
curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/database/DB_ID/metadata" \
  | jq '.tables[] | select(.schema == "public") | {id, name}'
```

### Inspect table schema

```bash
# Get column info for a specific table
curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/table/TABLE_ID/query_metadata" \
  | jq '.fields[] | {name, base_type}'
```

### Explore data with dry-run

Create a quick exploratory transform to preview data:

```bash
# Create a scratch transform to explore a table
curl -s -X POST -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"scratch_explore_users","source":{"type":"query","query":{"database":DB_ID,"type":"native","native":{"query":"SELECT * FROM users LIMIT 100"}}},"target":{"type":"table","schema":"public","name":"scratch_explore_users"}}' \
  "http://localhost:3000/api/ee/workspace/WS/transform"

# Dry-run to see data without persisting
curl -s -X POST -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID/dry-run"
```

Use dry-run liberally -- it's fast and doesn't persist anything.

## Data Analysis Workflow

### Exploring with dry-run

Dry-run is your primary exploration tool. It:
- Executes the query and returns preview rows
- Rolls back without persisting any data
- Provides column metadata in the response

Use it to iterate quickly on queries before committing to a transform structure.

### Presenting results

After running a dry-run or transform, **present results directly in chat** as an ASCII table. The conversation is the primary interaction surface -- the workspace view is for auditing and merging.

Example output format:
```
| id | name        | total_orders |
|----|-------------|--------------|
| 1  | Alice Smith | 42           |
| 2  | Bob Jones   | 17           |
| 3  | Carol White | 89           |
```

Always show the results to the user; don't just link to the workspace.

### Naming conventions

Use consistent naming to keep your workspace organized:

| Type | Convention | Example |
|------|------------|---------|
| **Final outputs** | `Output N: <Descriptive Title>` | `Output 1: Rating Variance by Reviewer Initial` |
| **Intermediate transforms** | Descriptive snake_case | `cleaned_reviews`, `variance_by_prefix` |
| **Scratch/exploratory** | Prefix with `scratch_` | `scratch_explore_orders`, `scratch_test_join` |

### Always specify schema in targets

When creating transforms, always specify the schema explicitly in the target:

```json
"target": { "type": "table", "schema": "public", "name": "variance_by_prefix" }
```

Don't rely on the default schema -- be explicit.

### When to use scratch vs. Output

**CRITICAL:** Use the right transform type:

- **`Output N:`** -- Use when the user asks a question that produces an answer. This is a final deliverable. Most user questions should result in an Output.
- **`scratch_`** -- Use ONLY for exploratory queries where you're discovering what data looks like before formulating the actual question. Examples: "what columns does this table have?", "what does the raw data look like?", "testing if this join works".

**If the user asks a question, create an Output, not a scratch transform.** The question "what is the mean variance?" is a question with an answer → Output. "Let me see what the reviews table looks like" is exploration → scratch.

### Cleaning up scratch transforms

Delete scratch transforms **immediately after they've served their purpose**, not just at end of session. After you've used a scratch transform to explore and understand the data, delete it before moving on:

```bash
curl -s -X DELETE -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/transform/SCRATCH_REF_ID"
```

Scratch transforms should be short-lived. A workspace with many old scratch transforms is poorly maintained.

### Using descriptions for findings

Store analysis notes and findings in transform descriptions:

```bash
curl -s -X PUT -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
  -d '{"description": "Finding: 23% of reviews have rating variance > 2 std devs."}' \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID"
```

This keeps your discoveries attached to the transforms that produced them.

### When to create vs. edit transforms

- **New transform**: Create a new transform when asking a semantically different question (different data, different aggregation, different purpose)
- **Edit in place**: Update an existing transform for bug fixes, tweaks, or refinements to the same question

### Reusing existing transforms (MANDATORY)

**Before creating ANY new transform, you MUST:**

1. **List existing transforms** in the workspace:
   ```bash
   curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/WS/transform" \
     | jq '.[] | {name, ref_id, target: .target.name}'
   ```
2. **Check if any existing transform already has the data you need** -- if so, read from its output table instead of re-querying source tables

This is not optional. Don't re-derive data that already exists in a transform output.

### Extract intermediates eagerly (don't duplicate queries)

**Before writing any new transform, check:** Am I about to duplicate a subquery or CTE that exists in another transform?

If yes, **STOP and refactor first:**

1. Extract the shared computation into a new intermediate transform
2. Update the existing transform to read from the intermediate
3. Write the new transform to also read from the intermediate

**Never duplicate a subquery across transforms.** If Output 1 computes variance with a complex GROUP BY, and Output 2 needs that same data, don't copy the GROUP BY -- extract it.

Example -- WRONG (duplicated logic):
```sql
-- Output 1
SELECT prefix, AVG(rating), VAR_POP(rating)
FROM reviews GROUP BY prefix

-- Output 2 (BAD: duplicates the aggregation)
SELECT AVG(variance) FROM (
  SELECT prefix, VAR_POP(rating) as variance
  FROM reviews GROUP BY prefix
)
```

Example -- CORRECT (shared intermediate):
```
variance_by_prefix              ← intermediate (holds the GROUP BY)
  ├── Output 1: Variance Details    ← SELECT * FROM variance_by_prefix
  └── Output 2: Variance Summary    ← SELECT AVG(variance) FROM variance_by_prefix
```

This keeps Outputs as leaf nodes that present data, while intermediates hold the reusable computations.

### Outputs should not depend on other Outputs

If a new Output needs data computed by an existing Output, don't make Output 2 depend on Output 1. Instead, extract the shared data into an intermediate, then have both Outputs read from it.

### Refactoring shared logic

If multiple transforms share the same cleaning/filtering/joining logic, extract it into a dedicated intermediate transform. Downstream transforms then read from that intermediate.

When referencing another transform's output, use the **target name** (e.g., `cleaned_reviews`), never the isolated schema. The isolation schema is an internal implementation detail.

### Breaking complex analysis into phases

For complex questions, build up in sanity-checkable phases:

1. **Data cleaning** -- Create transforms that clean/normalize source data
2. **Aggregation** -- Build intermediate aggregations you can verify
3. **Final analysis** -- Combine intermediates into final outputs

Run each phase and verify results before proceeding. This makes debugging easier when something looks wrong.

Example progression:
```
scratch_raw_sample      → Verify source data looks right, then DELETE
cleaned_reviews         → Verify cleaning logic (intermediate, keep)
variance_by_prefix      → Verify grouping is correct (intermediate, keep)
Output 1: Variance Details  → Final answer
```

### Session cleanup

Before ending an analysis session:

1. List all transforms:
   ```bash
   curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/WS/transform" \
     | jq '.[] | {name, ref_id}'
   ```

2. Verify no scratch transforms remain (they should have been deleted as you went -- see "Cleaning up scratch transforms" above)

3. If the analysis is complete and you don't need the workspace anymore, archive it:
   ```bash
   curl -s -X POST -H "x-api-key: API_KEY" \
     "http://localhost:3000/api/ee/workspace/WS/archive"
   ```

## Pipeline Development Workflow

### Create and test a transform

```bash
# 1. Check workspace is usable
curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/WS/transform"

# 2. Create a transform (pretty-print SQL, always specify schema)
curl -s -X POST -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Active Users","description":"Summarizes active user accounts","source":{"type":"query","query":{"database":19,"type":"native","native":{"query":"SELECT id, email, first_name FROM core_user WHERE is_active = true"}}},"target":{"type":"table","schema":"public","name":"active_users"}}' \
  "http://localhost:3000/api/ee/workspace/WS/transform"
# Response includes ref_id, target_isolated, target_stale

# 3. Dry-run to preview results (no persistence)
curl -s -X POST -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID/dry-run"
# Returns: { status, data: { rows, cols, results_metadata } }

# 4. Iterate -- update the transform and dry-run again
curl -s -X PUT -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
  -d '{"source":{"type":"query","query":{"database":19,"type":"native","native":{"query":"SELECT id, email, first_name, last_login FROM core_user WHERE is_active = true ORDER BY last_login DESC"}}}}' \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID"

# 5. Run to persist to isolated schema
curl -s -X POST -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID/run"
# Returns: { status, start_time, end_time, table: { name, schema } }
```

### Debug a failing transform

```bash
# 1. Dry-run to see the error message
curl -s -X POST -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID/dry-run"
# Failed response: { "status": "failed", "message": "ERROR: ..." }

# 2. Check transform details for last run info
curl -s -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/transform/REF_ID"
# Look at: last_run_status, last_run_message, target_stale

# 3. Check workspace-level problems
curl -s -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/problem"

# 4. Inspect the dependency graph
curl -s -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/graph"

# 5. Check setup/execution logs
curl -s -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/log"
```

### Run all and prepare for merge

```bash
# Run all transforms in dependency order (skip up-to-date ones)
curl -s -X POST -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/run?stale_only=1"
# Returns: { succeeded: [...], failed: [...], not_run: [...] }

# Verify no merge-blocking problems exist
curl -s -H "x-api-key: API_KEY" \
  "http://localhost:3000/api/ee/workspace/WS/problem"

# Merge to production (superuser only)
curl -s -X POST -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
  -d '{"commit-message": "Add user analytics transforms"}' \
  "http://localhost:3000/api/ee/workspace/WS/merge"
# Returns: { merged: [{ op, global_id, ref_id }], workspace: { id, name } }
```

### Work with Python transforms

```bash
curl -s -X POST -H "x-api-key: API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"User Order Summary","source":{"type":"python","source-database":19,"source-tables":{"users":1015,"orders":1042},"body":"import pandas as pd\nresult = users_df.merge(orders_df, on='\''user_id'\'')"},"target":{"type":"table","schema":"public","name":"user_order_summary"}}' \
  "http://localhost:3000/api/ee/workspace/WS/transform"
```

Python transforms receive each source table as a pandas DataFrame named `<table_name>_df`. The result must be a DataFrame assigned to `result`.

## Best Practices

### Keep queries simple and focused

Each transform should do one thing well. If a query is getting complex, break it into multiple transforms.

### Pretty-print SQL

Format SQL queries for readability with proper indentation and line breaks:

```sql
SELECT
  u.id,
  u.name,
  COUNT(o.id) AS order_count,
  SUM(o.total) AS total_spent
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.is_active = true
GROUP BY u.id, u.name
ORDER BY total_spent DESC
```

### Factor out data cleaning

Create dedicated cleaning transforms for:
- Null handling
- Type conversions
- Deduplication
- Filtering invalid records

Other transforms can then depend on the cleaned data.

### Avoid duplicated boilerplate

If you're copying the same CTE or subquery into multiple transforms:
1. Extract it into its own transform
2. Have downstream transforms read from that output table (using the target name)

This keeps logic in one place and makes updates easier.

### Always use target names, not isolated schemas

When one transform reads from another's output, reference the **target name** (e.g., `SELECT * FROM cleaned_reviews`). Never query the isolated schema directly -- it's an internal implementation detail that should not appear in transform queries.

### Build reusable intermediates

When patterns emerge across multiple analyses:
- Create well-named intermediate transforms (not `scratch_*`)
- Add clear descriptions explaining what they contain
- Run them (not just dry-run) so downstream transforms can reference their output

## Conceptual Model

### What workspaces are

A workspace is an isolated environment for developing transforms -- like a branch in git. You create or check out transforms inside a workspace, iterate on them with dry-runs and test executions, and merge when ready. What happens in a workspace stays in the workspace until you merge.

### Isolation

Every workspace gets its own database schema (e.g., `mb__isolation_ab493_2849`). When you run a transform in a workspace, the output table is written to this isolated schema, not to the global target location. This means:

- You can freely run transforms without affecting production data
- Multiple workspaces can work on the same transform independently
- Dry-runs don't persist anything at all -- they return preview rows and roll back

**Important:** The isolation schema is an internal implementation detail. Always write queries that reference target names (e.g., `cleaned_reviews`), not isolated schema paths. The system handles resolution automatically.

### Transforms

A transform takes a source (SQL query or Python code) and writes the result to a target table. Transforms can depend on each other -- if Transform B reads from Transform A's output table, that's a dependency.

**Source types in workspaces:**
- **Native SQL** (`"type": "query"` with `"type": "native"` inside) -- most common
- **Python** (`"type": "python"`) -- for pandas-style data manipulation
- MBQL and card references are **not supported** in workspaces

**Target types:**
- `"table"` -- full replacement on each run
- `"table-incremental"` with checkpoint strategy -- append-only, tracks progress via a checkpoint column

### Dependency graph

Workspaces maintain a dependency graph with three node types:
- **Input tables** -- source data that transforms read from
- **Workspace transforms** -- transforms being developed in this workspace
- **External transforms** -- global transforms that workspace transforms depend on

The graph determines execution order (topological sort) and is used to detect problems like cycles and conflicts.

### Merge

Merging promotes workspace transform definitions to global scope. The merge process:
1. Validates that no merge-blocking problems exist (cycles, conflicts, broken downstream dependencies)
2. Creates or updates global transform records from workspace versions
3. Archives the workspace
4. Records an audit trail (workspace merge history)

Non-blocking problems (like unused transforms) produce warnings but don't prevent merging.

### Staleness

A transform is "stale" when any of the following is true:
1. It has never run
2. Its definition has changed since its last successful run
3. A table it depends upon has since been updated by another transform
4. Any of its ancestor transforms is stale

The `stale_only` flag on the run-all endpoint will skip transforms that are already up to date, performing the minimal amount of work to ensure that there are no longer any stale transforms.

### Identity

Workspace transforms are identified by a `ref_id` -- a human-readable slug like `lucid-ferret-a852`. This is workspace-scoped, not globally unique. A transform may also have a `global_id` if it was checked out from an existing global transform.

## Authentication

Pass an API key via header:

```bash
curl -s -H "x-api-key: API_KEY" "http://localhost:3000/api/ee/workspace/WS"
```

The user will provide the API key explicitly.

**Access model:**
- **Superuser** -- full access to everything, required for merge operations
- **Workspace service user** -- can read workspace state, manage and run transforms (matched by the workspace's `execution_user` field)
- **Data analyst** -- can manage global transforms (needs read permission on source tables)

## API Reference

### Workspace Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ee/workspace/` | List workspaces (superuser) |
| `POST` | `/api/ee/workspace/` | Create workspace (superuser) |
| `GET` | `/api/ee/workspace/:id` | Get workspace |
| `PUT` | `/api/ee/workspace/:id` | Update workspace (superuser) |
| `POST` | `/api/ee/workspace/:id/archive` | Archive (superuser) |
| `POST` | `/api/ee/workspace/:id/unarchive` | Unarchive (superuser) |
| `DELETE` | `/api/ee/workspace/:id` | Delete archived workspace (superuser) |
| `GET` | `/api/ee/workspace/:id/table` | List input/output tables |
| `GET` | `/api/ee/workspace/:id/graph` | Dependency graph |
| `GET` | `/api/ee/workspace/:id/log` | Setup and execution logs |
| `GET` | `/api/ee/workspace/:id/problem` | Detect problems |
| `POST` | `/api/ee/workspace/:id/run` | Run all transforms |
| `POST` | `/api/ee/workspace/:id/merge` | Merge all to production (superuser) |
| `GET` | `/api/ee/workspace/:id/external/transform` | Global transforms for checkout |
| `GET` | `/api/ee/workspace/enabled` | Check workspace support |
| `GET` | `/api/ee/workspace/database` | Database support info |
| `GET` | `/api/ee/workspace/checkout?transform-id=N` | Checkout info for a global transform |

### Workspace Transform Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ee/workspace/:ws/transform` | List transforms |
| `POST` | `/api/ee/workspace/:ws/transform` | Create transform |
| `GET` | `/api/ee/workspace/:ws/transform/:ref` | Get transform |
| `PUT` | `/api/ee/workspace/:ws/transform/:ref` | Update transform |
| `DELETE` | `/api/ee/workspace/:ws/transform/:ref` | Delete transform |
| `POST` | `/api/ee/workspace/:ws/transform/:ref/run` | Run transform |
| `POST` | `/api/ee/workspace/:ws/transform/:ref/dry-run` | Preview transform |
| `POST` | `/api/ee/workspace/:ws/transform/:ref/merge` | Merge single transform (superuser) |
| `POST` | `/api/ee/workspace/:ws/transform/:ref/archive` | Mark for archival on merge |
| `POST` | `/api/ee/workspace/:ws/transform/:ref/unarchive` | Recall archived transform |
| `POST` | `/api/ee/workspace/:ws/transform/validate/target` | Validate target table |

### Global Transform Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ee/transform/` | List transforms (filterable) |
| `POST` | `/api/ee/transform/` | Create transform |
| `GET` | `/api/ee/transform/:id` | Get transform |
| `PUT` | `/api/ee/transform/:id` | Update transform |
| `DELETE` | `/api/ee/transform/:id` | Delete transform |
| `DELETE` | `/api/ee/transform/:id/table` | Delete output table |
| `POST` | `/api/ee/transform/:id/run` | Run (async, returns run_id) |
| `POST` | `/api/ee/transform/:id/cancel` | Cancel running transform |
| `GET` | `/api/ee/transform/:id/dependencies` | Get dependencies |
| `GET` | `/api/ee/transform/:id/merge-history` | Merge audit trail |
| `GET` | `/api/ee/transform/run` | Query transform runs (filterable) |
| `POST` | `/api/ee/transform/extract-columns` | Get checkpoint-eligible columns |
| `POST` | `/api/ee/transform/is-simple-query` | Check if SQL is simple |

### Transform Job Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ee/transform-job/` | List scheduled jobs |
| `POST` | `/api/ee/transform-job/` | Create job (cron schedule) |
| `GET` | `/api/ee/transform-job/:id` | Get job |
| `PUT` | `/api/ee/transform-job/:id` | Update job |
| `DELETE` | `/api/ee/transform-job/:id` | Delete job |
| `POST` | `/api/ee/transform-job/:id/run` | Manually trigger job |
| `GET` | `/api/ee/transform-job/:id/transforms` | List transforms in job |

## Key Codebase Locations

| Area | Path |
|------|------|
| Workspace API | `enterprise/backend/src/metabase_enterprise/workspaces/api.clj` |
| Transform API | `enterprise/backend/src/metabase_enterprise/transforms/api.clj` |
| Transform Job API | `enterprise/backend/src/metabase_enterprise/transforms/api/transform_job.clj` |
| Workspace models | `enterprise/backend/src/metabase_enterprise/workspaces/models/` |
| Transform models | `enterprise/backend/src/metabase_enterprise/transforms/models/` |
| Workspace types | `enterprise/backend/src/metabase_enterprise/workspaces/types.clj` |
| Transform schemas | `enterprise/backend/src/metabase_enterprise/transforms/schema.clj` |
| Route registration | `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj` |

## Gotchas

- **Keep curl commands on one line:** The entire `-d '...'` JSON body must be on a single line (or use `\` continuation properly). Do NOT let the JSON wrap with actual newlines inside string values - this breaks JSON parsing.
- **Escape single quotes for bash:** Since curl JSON is wrapped in bash single quotes, any single quote in your SQL or Python code needs escaping. Use `'\''` for each single quote. Example: `!= ''` becomes `!= '\'''\''` and `on='user_id'` becomes `on='\''user_id'\''`.
- **Always include `schema` in targets:** The API may reject targets without an explicit schema. Always specify it: `"target": { "type": "table", "schema": "public", "name": "..." }`.
- **Workspace auto-initializes:** An `uninitialized` workspace transitions to `ready` when you create the first transform. No manual initialization step is needed.
- **Database set by first transform:** An empty workspace doesn't have a database yet. The database is determined when you create the first transform (from the query's database field).
- **Never query isolated schemas:** Always reference target names in your SQL (e.g., `FROM cleaned_reviews`). The isolation schema is an internal detail -- the system resolves references automatically.
