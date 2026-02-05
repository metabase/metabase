---
name: workspace-transforms
description: Develop and debug workspace transforms using the Metabase enterprise API for isolated transform editing, testing, and merging
---

# Workspace Transforms

This skill covers the Metabase workspace and transform APIs -- creating, testing, running, and debugging transforms in isolated workspaces before merging them to production.

## Conceptual Model

### What workspaces are

A workspace is an isolated environment for developing transforms -- like a branch in git. You create or check out transforms inside a workspace, iterate on them with dry-runs and test executions, and merge when ready. What happens in a workspace stays in the workspace until you merge.

### Isolation

Every workspace gets its own database schema (e.g., `mb__isolation_ab493_2849`). When you run a transform in a workspace, the output table is written to this isolated schema, not to the global target location. This means:

- You can freely run transforms without affecting production data
- Multiple workspaces can work on the same transform independently
- Dry-runs don't persist anything at all -- they return preview rows and roll back

The `target_isolated` field on a workspace transform tells you the actual isolated table location. The `target` field describes where the output will live once merged.

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
2. It's definition has changed since its last successful run
3. A table it depends upon has since been updated by another transform
4. Any of its ancestor transforms is stale

The `stale_only` flag on the run-all endpoint will skip transforms that are already up to date, performing the minimal amount of work to ensure that there are no longer any stale transforms.

### Identity

Workspace transforms are identified by a `ref_id` -- a human-readable slug like `lucid-ferret-a852`. This is workspace-scoped, not globally unique. A transform may also have a `global_id` if it was checked out from an existing global transform.

## Authentication

Pass an API key via header:

```bash
curl -H "x-api-key: $API_KEY" "http://localhost:3000/api/ee/workspace/$WS_ID"
```

**Access model:**
- **Superuser** -- full access to everything, required for merge operations
- **Workspace service user** -- can read workspace state, manage and run transforms (matched by the workspace's `execution_user` field)
- **Data analyst** -- can manage global transforms (needs read permission on source tables)

## Common Workflows

### Create and test a transform

```bash
# 1. Check workspace is usable
curl -H "x-api-key: $KEY" "http://localhost:3000/api/ee/workspace/$WS/transform"

# 2. Create a transform
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "Active Users",
    "description": "Summarizes active user accounts",
    "source": {
      "type": "query",
      "query": {
        "database": 19,
        "type": "native",
        "native": {
          "query": "SELECT id, email, first_name FROM core_user WHERE is_active = true"
        }
      }
    },
    "target": { "type": "table", "name": "active_users" }
  }' \
  "http://localhost:3000/api/ee/workspace/$WS/transform"
# Response includes ref_id, target_isolated, target_stale

# 3. Dry-run to preview results (no persistence)
curl -X POST -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/transform/$REF_ID/dry-run"
# Returns: { status, data: { rows, cols, results_metadata } }

# 4. Iterate -- update the transform and dry-run again
curl -X PUT -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{ "source": { "type": "query", "query": { "database": 19, "type": "native", "native": { "query": "SELECT id, email, first_name, last_login FROM core_user WHERE is_active = true ORDER BY last_login DESC" }}}}' \
  "http://localhost:3000/api/ee/workspace/$WS/transform/$REF_ID"

# 5. Run to persist to isolated schema
curl -X POST -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/transform/$REF_ID/run"
# Returns: { status, start_time, end_time, table: { name, schema } }
```

### Debug a failing transform

```bash
# 1. Dry-run to see the error message
curl -X POST -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/transform/$REF_ID/dry-run"
# Failed response: { "status": "failed", "message": "ERROR: ..." }

# 2. Check transform details for last run info
curl -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/transform/$REF_ID"
# Look at: last_run_status, last_run_message, target_stale

# 3. Check workspace-level problems
curl -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/problem"

# 4. Inspect the dependency graph
curl -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/graph"

# 5. Check setup/execution logs
curl -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/log"
```

### Run all and prepare for merge

```bash
# Run all transforms in dependency order (skip up-to-date ones)
curl -X POST -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/run?stale_only=1"
# Returns: { succeeded: [...], failed: [...], not_run: [...] }

# Verify no merge-blocking problems exist
curl -H "x-api-key: $KEY" \
  "http://localhost:3000/api/ee/workspace/$WS/problem"

# Merge to production (superuser only)
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{"commit-message": "Add user analytics transforms"}' \
  "http://localhost:3000/api/ee/workspace/$WS/merge"
# Returns: { merged: [{ op, global_id, ref_id }], workspace: { id, name } }
```

### Work with Python transforms

```bash
curl -X POST -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "User Order Summary",
    "source": {
      "type": "python",
      "source-database": 19,
      "source-tables": { "users": 1015, "orders": 1042 },
      "body": "import pandas as pd\nresult = users_df.merge(orders_df, on='\''user_id'\'')"
    },
    "target": { "type": "table", "name": "user_order_summary" }
  }' \
  "http://localhost:3000/api/ee/workspace/$WS/transform"
```

Python transforms receive each source table as a pandas DataFrame named `<table_name>_df`. The result must be a DataFrame assigned to `result`.

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

- **SQL quoting in JSON:** Single quotes in SQL need shell escaping when embedded in JSON curl commands. Use `'\''` in bash or pass the body via a file (`-d @body.json`).
- **`schema` field in target validation:** The `/validate/target` endpoint requires a `schema` field -- omitting it returns an error even though the create endpoint infers it.
- **Workspace auto-initializes:** An `uninitialized` workspace transitions to `ready` when you create the first transform. No manual initialization step is needed.
- **Target names are prefixed in isolation:** A target named `my_table` becomes `__my_table` in the isolated schema. The `target_isolated` field on the transform response shows the actual location.
