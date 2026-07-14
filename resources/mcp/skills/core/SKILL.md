---
name: core
description: Foundations for driving Metabase over MCP — which tool answers which question, the find → inspect → run → save workflow, the conventions every tool shares (concise projections, bounded lists, `limit`/`offset` paging, id-or-entity_id refs, query handles), what to save an answer as, and how to read a teaching error. Load first for any Metabase job; it routes to the specialized skills for deeper work. Triggers — "what's in Metabase", "find the data", "save this as a question", "which tool do I use".
---

# Core

Metabase is a BI instance: databases it connects to, and content people saved on top of them —
questions, models, metrics, dashboards, documents, collections. Every tool call runs as the connected
user with their permissions, so a tool can never reach data the person couldn't open in the app.

## The workflow

1. **Find** — `search` (by name or meaning), `browse_data` (databases → schemas → tables → fields),
   `browse_collection` (the folder tree).
2. **Inspect** — `get_content` for an entity, `browse_data` with the `get_fields` action for a table's
   columns. Read the fields before you write a query. Column names are never a guess.
3. **Run** — `execute_query` (MBQL), `execute_sql` (raw SQL).
4. **Save** — `create_question`, `create_metric`, `create_dashboard`, `create_collection`, and the
   matching update tools.

Reads and writes never share a tool. Nothing is saved as a side effect of running a query.

## Which tool

| Question | Tool |
| --- | --- |
| Does something like this already exist? | `search` (`recent` for what the user just looked at) |
| What data is there? What columns? | `browse_data` |
| What's in this collection, or where does it live? | `browse_collection` |
| What is this thing, exactly? | `get_content` |
| What values can this filter take? | `get_parameter_values` |
| Answer a data question | `execute_query`, or `execute_sql` when structured MBQL can't say it |
| Save an answer | `create_question` — load the `mbql` skill for the query itself |
| Save a number the business agrees on | `create_metric` |
| Put saved questions on a dashboard | `create_dashboard` — load the `dashboard` skill |
| Rename, move, re-query, or archive something | `update_question`, `update_metric`, `update_dashboard` |
| A new folder | `create_collection` |

`get_content` reads any of `question`, `model`, `metric`, `measure`, `segment`, `dashboard`,
`document`, `collection`, `timeline`, `transform`, `snippet`, `subscription`, `alert` — up to ten
entities of mixed types in one call. Its `include` sections go deeper: `definition` (the query),
`fields`, `parameters`, `layout`, `dimensions`, `revisions`.

## Conventions every tool shares

**Concise by default.** Every read takes a `response_format` of `concise` or `detailed`. Concise is a
subset of the full record with the same property names; detailed is the whole record. Ask for detailed
only when you need a field concise doesn't carry.

**Bounded lists.** A list response carries its rows, how many came back, and how many exist. Page with
`limit` and `offset`. When a response is truncated it says which parameter narrows it — follow that
instruction instead of re-issuing the same call.

**Refs widen, they don't rename.** An id argument takes a numeric id or a 21-character `entity_id`, so
whatever `search` hands back is what a write tool accepts.

**Query handles.** `execute_query` returns a `query_handle` whether or not it executed — `validate_only`
dry-runs it. Pass the handle to `create_question` or `visualize_query` instead of re-emitting the query:
the handle saves exactly the query that ran, and a re-emitted query is a regeneration that can silently
differ. The same handle with a higher `offset` continues a large result set.

**Errors teach.** A failure names the fix — the missing permission, the parameter to change, the tool
to call instead. Read it and correct the call. Repeating an identical call is never the fix.

## What to save it as

Search before you save. A second "Revenue" is worse than no "Revenue".

- **A question** is an answer someone asked for. `create_question` takes the handle of the query you
  just ran, plus a name someone could find by searching.
- **A metric** is a number the business agrees on — one aggregation, at most one date grouping.
  `create_metric` takes the same handle, and once it exists, a query on its table can reference it.

## Moving and archiving

Both ride the entity's own update tool; there is no separate organize tool.

- **Move**: set `collection_id` on `update_question`, `update_metric`, or `update_dashboard`.
- **Archive and restore**: set `archived` on the same update. This is Metabase's trash — reversible,
  and the right answer to "delete this". There is no permanent delete; don't look for one.
- **New folder**: `create_collection`, nested with `parent_collection_id`.

## Skills

- `mbql` — the query grammar `execute_query` speaks.
- `native-sql` — raw SQL through `execute_sql`, and how to save it.
- `dashboard` — assembling saved questions into a dashboard.
- `visualization` — display types and `visualization_settings`.
