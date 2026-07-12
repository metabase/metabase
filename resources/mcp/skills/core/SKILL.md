---
name: core
description: Foundations for driving Metabase over MCP — the seven toolsets and which tool answers which question, the read → run → save → organize workflow, the conventions every tool shares (concise projections, bounded list envelopes, `limit`/`offset` paging, id-or-entity_id refs, query handles, the create/update `method` recipe on every write), and how to read a teaching error. Load first for any Metabase job; it routes to the specialized skills for deeper work. Triggers — "what's in Metabase", "find the data", "save this as a question", "which tool do I use".
---

# Core

Metabase is a BI instance: databases it connects to, and content people saved on top of them —
questions, models, metrics, dashboards, documents, collections. Every tool call runs as the connected
user with their permissions, so a tool can never reach data the person couldn't open in the app.

## The workflow

1. **Find** — `search` (by name or meaning), `browse_data` (databases → schemas → tables → fields),
   `browse_collection` (the folder tree).
2. **Inspect** — `get_content` for an entity, `browse_data(action: "get_fields")` for a table's
   columns. Read the fields before you write a query. Column names are never a guess.
3. **Run** — `execute_query` (MBQL), `execute_sql` (native SQL), `run_saved_question` (an existing
   question, with parameters).
4. **Save** — `question_write`, `dashboard_write`, `document_write`, `collection_write`.
5. **Organize / notify** — `bookmark_content`, `add_timeline_event`, `revert_content`, `alert_write`,
   `subscription_write`.

Reads and writes never share a tool. Nothing is saved as a side effect of running a query.

## Which tool

| Question | Tool |
| --- | --- |
| Does something like this already exist? | `search` (`recent: true` for what the user just looked at) |
| What data is there? What columns? | `browse_data` |
| What's in this collection / where does it live? | `browse_collection` |
| What is this thing, exactly? | `get_content` (`include: ["definition", "fields", "parameters", "layout", "dimensions", "revisions"]`) |
| What values can this filter take? | `get_parameter_values` |
| Answer a data question | `execute_query`, or `execute_sql` when structured MBQL can't say it |
| Re-run something saved, maybe filtered | `run_saved_question` |
| Save / edit a question or model | `question_write` (`card_type: "question" \| "model"`) |
| Build or edit a dashboard | `dashboard_write` (ops) — load the `dashboard` skill |
| Write or edit a document | `document_write` — load the `document` skill |
| Copy someone's dashboard to iterate on it | `duplicate_content` |
| Reusable SQL / filter / aggregation | `snippet_write`, `segment_write`, `measure_write` — load `curation` |

## Conventions every tool shares

**Concise by default.** Every read takes `response_format: "concise" | "detailed"`. Concise is a subset
of the REST record with the same property names; detailed is the whole record. Ask for detailed only
when you need a field concise doesn't carry.

**Bounded lists.** List responses are `{data, returned, total, truncated?}`. Page with `limit` and
`offset`. When a response is truncated it says which parameter narrows it — follow that instruction
instead of re-issuing the same call.

**Refs widen, they don't rename.** Any `*_id` takes a numeric id or a 21-character `entity_id`, so
whatever `search` hands back is what a write tool accepts. `collection_id` and `parent_id` also take
`null` or `"root"` (the root collection). `"trash"` appears only in `browse_collection`'s locator —
you never *write* to the trash; you set `archived: true`.

**Query handles.** `execute_query` and `execute_sql` return a `query_handle` whether or not they
executed (`validate_only: true` dry-runs). Pass the handle to `question_write` or `visualize_query`
instead of re-emitting the query: the handle saves exactly the query that ran, and a re-emitted query
is a regeneration that can silently differ. Handles also continue a large result set: same handle,
higher `offset`.

**Writes take a method.** `method: "create"` or `method: "update"`, plus `id` on update. Fields
required for one method and not the other are stated in the description and enforced when you call —
if you get it wrong the error names the field to add. `archived: true` on an update is Metabase's
trash: recoverable, and the way to "delete" something. `collection_id` on an update moves the item;
`collection_position` pins it.

**Errors teach.** A failure names the fix — the missing permission, the parameter to change, the tool
to call instead. Read it and correct the call. Repeating an identical call is never the fix.

## Skills

- `mbql` — the query grammar `execute_query` speaks.
- `native-sql` — template tags, field filters, snippets.
- `dashboard` — the `dashboard_write` op grammar: cards, tabs, parameters, wiring.
- `visualization` — display types and `visualization_settings`.
- `document` — the Markdown dialect `document_write` reads and writes.
- `curation` — models, metrics, measures, segments, snippets, and keeping the library trustworthy.
