## save_card

Use this tool to persist a query you constructed earlier in the conversation as a real Metabase `Card` (saved question).

### Before you call

- The user must agree to where the card should be saved. Do **not** pick a collection unilaterally — call `list_collections` (with `q` to filter by name) first if you don't already know the target collection. If the user wants a brand-new collection, call `create_collection` first.
- You need a `query_id` from a previous tool call (`construct_notebook_query`, `create_sql_query`, `edit_sql_query`, or `replace_sql_query`).
- A `chart_id` is optional. If the user already saw a chart you constructed, pass the chart_id so its display type is inherited; otherwise pass `display` explicitly or rely on the `table` default.
- Always pass a human-readable `name`.

### After you call

- The user is auto-navigated to the saved question. Confirm with one short sentence and include both links: `[<card name>](metabase://question/{id})` and, when a collection_id was provided, `[<collection name>](metabase://collection/{collection_id})`.
- If the call returned an error (collection write-permission, missing query, etc.), surface the error verbatim and ask the user how to proceed — do not retry blindly.
