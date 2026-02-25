---
name: metastudio
description: Expert knowledge about the Metastudio VS Code extension — transforms, dependency checking, connection setup, and running transforms against Metabase.
user-invokable: true
---

# Metastudio

Metastudio is a VS Code extension for working with Metabase content (transforms, cards, dashboards, collections, and more) that has been synced locally via Metabase Remote Sync. The workspace must contain a `metabase.config.json` file at its root for the extension to activate.

## Connection Setup

Before running transforms you must configure a connection:

1. **Set the host URL**: Run `Metastudio: Set Host URL` from the Command Palette, or use the `metastudio_setHost` tool.
2. **Set the API key**: Run `Metastudio: Set API Key` from the Command Palette, or use the `metastudio_setApiKey` tool. The key is stored in VS Code's secure secret storage — never in plain-text settings.
3. **Verify the connection**: Run `Metastudio: Check Metabase Connection` from the Command Palette, or use the `metastudio_checkConnection` tool.

## Transform YAML Structure

Transforms are stored as YAML files anywhere inside the workspace folder. A minimal example:

```yaml
entity_id: BssO7GsawP2WszjcnIjMw   # 21-char base32, must be unique
name: My Transform
description: null                    # optional
collection_id: null                  # entity_id of parent collection, or null
source_database_id: MyDatabase       # database name (resolved to numeric ID at run time)
source:
  type: query
  query:
    database: MyDatabase
    type: native                     # native | python | query (see below)
    native:
      query: "SELECT * FROM my_table WHERE id > 100"
target:
  type: table
  database: MyDatabase
  schema: public
  name: output_table_name            # the table Metabase will write results to
tags: []
serdes/meta:
  - id: BssO7GsawP2WszjcnIjMw       # must match entity_id above
    label: output_table_name
    model: Transform
```

### Query Types

The `source.query.type` field controls what language the transform uses:

| Value | Language | Query body location |
|---|---|---|
| `native` | SQL | `source.query.native.query` |
| `python` | Python | `source.query.native.query` |
| `query` | Structured (MBQL) | `source.query.query` — **cannot be run in a workspace** |

Only `native` (SQL) and `python` transforms can be executed. Attempting to run a structured transform shows an error.

### Target Table

The `target` block defines where the transform writes its output:
- `database` — the Metabase database name to write to
- `schema` — the schema (e.g. `public`)
- `name` — the output table name (snake_case recommended)

## Dependency Checking

### Automatic On Save

Every time any `.yaml` file in the workspace is saved, Metastudio automatically runs a dependency check **1 second after the last save** (debounced). No user action is required — just save the file.

Results appear in the VS Code **Problems Panel** (`Cmd+Shift+M` on Mac, `Ctrl+Shift+M` on Windows/Linux). Diagnostics are tagged with source `metabase-dependencies`.

### What Is Checked

Metastudio scans every entity's YAML for references to other entities and verifies they all exist in the export:

- **Errors** — a required entity is missing (e.g. a transform references a database or collection that isn't in the export)
- **Warnings** — dependency cycles (circular references), reported as: `Dependency cycle: Transform A → Card B → Transform A`

### Manual Check

Run **`Metastudio: Check Dependency Graph`** from the Command Palette to trigger a check immediately. If issues are found the Problems Panel opens automatically.

### Dependency Graph Visualization

Run **`Metastudio: Show Dependency Graph`** to open an interactive webview showing all entities and their dependency edges as a directed graph. Click any node to open its YAML file.

## Running Transforms

There are three ways to run a transform:

1. **Sidebar button**: In the **Content** panel (Metabase sidebar), click the ▷ play button next to a transform name.
2. **Transform preview**: Click a transform in the sidebar to open the preview panel, then click **Run**.
3. **LM tool**: Use `metastudio_runTransform` with `name` (case-insensitive) or `entityId`.

Metastudio will:
1. Resolve source/target database names to numeric IDs
2. Create or reuse a Metabase workspace for this database
3. Register the transform definition in the workspace
4. Grant input table access (requires admin API key)
5. Execute the transform
6. Report success with the output table location, or a specific error message

### Common Run Errors

| Error | Cause | Fix |
|---|---|---|
| "host and API key must be configured" | Connection not set up | Run `Metastudio: Set Host URL` and `Metastudio: Set API Key` |
| "Database X not found" | Database name in YAML doesn't match Metabase | Check `source_database_id` spelling |
| "Transform input tables not granted" | Admin key needed to grant access | Ask a Metabase admin to grant workspace input access |
| "permission denied" | Workspace service account lacks SELECT on source tables | Ask a DB admin to grant SELECT to the workspace service account |
| "cannot be run in a workspace" | Transform uses the structured query builder | Rewrite as a native SQL or Python transform |

## Available LM Tools

These tools can be invoked by AI agents in VS Code Chat:

| Tool | What it does |
|---|---|
| `metastudio_setHost` | Set the Metabase instance URL |
| `metastudio_getHost` | Get the currently configured Metabase instance URL |
| `metastudio_setApiKey` | Set the API key, or check whether one is set (shows last 4 chars) |
| `metastudio_getApiKey` | Get the current API key masked (e.g. `********abcd`), or report that none is set |
| `metastudio_checkConnection` | Test the connection — returns success with user name, or a specific error |
| `metastudio_runTransform` | Run a transform by display name (case-insensitive) or entity ID |

## Tips

- The `entity_id` in `serdes/meta` must match the top-level `entity_id` field.
- File names don't matter — only the `serdes/meta` block is used for identification.
- The `source_database_id` must exactly match a database name in your Metabase instance.
- Use distinct `target.name` values across transforms — if two transforms write to the same table, the last one to run wins.
- Check the **Metastudio** output channel (VS Code Output panel) for a full execution trace including entity ID resolution steps.
