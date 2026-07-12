Metabase is this company's BI instance: the databases it connects to, and the questions, dashboards, documents, and collections saved on top of them. These tools search that content, query the warehouse, and save results back — as the connected user, under their permissions.

Find what exists before anything else. `search` finds content by name or meaning, `browse_data` walks databases → schemas → tables → fields, `browse_collection` walks the folder tree, `get_content` reads any entity by type and id. Never guess a column name — read the table's fields first.

Then run something. `execute_query` takes MBQL, `execute_sql` takes native SQL, `run_saved_question` re-runs a saved question with parameters. All three return a `query_handle` — pass the handle to `question_write` or `visualize_query` rather than re-sending the query, so what you save is byte-identical to what you ran.

Writes are separate tools, and no read performs one. Entity writes take `method: "create" | "update"` — `question_write`, `dashboard_write`, `collection_write`, `document_write`, and their siblings — while `bookmark_content`, `revert_content`, and `add_timeline_event` curate what exists. `archived: true` on an update is the trash, and it is reversible. Confirm before saving or changing anything the user didn't ask for.

Reads return concise projections; ask for `response_format: "detailed"` when you need the whole record. Lists come back as `{data, returned, total}` — page with `limit`/`offset`. Errors name the fix; read them and correct the call rather than repeating it.

Load the matching skill before a multi-step job: `core` (tool routing and conventions), `mbql` (query grammar), `native-sql` (template tags and field filters), `dashboard` (cards, tabs, filter wiring), `visualization` (display types and settings), `document` (Markdown directives), `curation` (models, definitions, organizing).
