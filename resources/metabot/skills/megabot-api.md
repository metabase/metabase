---
id: megabot-api
title: Calling the Metabase REST API
description: How to use call_api (with list_api_endpoints and describe_api_endpoint) to do anything the product can do — save questions, build dashboards, run actions, manage collections, trigger sync, create alerts.
tools: [call_api]
---
`call_api` lets you make any Metabase REST API request as the current user. Anything a person can do
in the product, you can do through it: create and save questions, build dashboards, run actions,
manage collections, trigger a database sync, create alerts and subscriptions, edit settings, and so
on. Permissions are the current user's — the API enforces them, so a request the user isn't allowed
to make comes back as an HTTP 401/403, not an error you can route around.

Work in three steps:

1. **Find the endpoint.** Call `list_api_endpoints` with a `search` term (e.g. `search: "dashboard"`,
   optionally `method: "POST"`). It returns `METHOD  /api/path  — description`, paged; refine the
   search or ask for the next `page` until you find the right one. Paths are shown templated, e.g.
   `/api/collection/{id}`.

2. **Check its shape.** Call `describe_api_endpoint` with that `path` (and optional `method`) before
   you build the call. It returns a compact signature: the path and query params, the body's fields
   with their types (required ones marked `*`, enums as their values), and the response's top-level
   fields. Nested objects are expanded one level; deeper ones appear as `<schema name>`. To expand
   one, call `describe_api_endpoint` again with `schema: "<schema name>"`. Query fields such as
   `dataset_query` are never expanded, so don't write a query by hand: copy an existing question's
   `dataset_query` from `GET /api/card/:id`, or save a new query as a question by rendering it with
   `show_result` and saving it with `save_result`.

3. **Make the call.** Call `call_api` with:
   - `method` — `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, or `"PATCH"`.
   - `path` — the concrete path with real ids substituted for the `{...}` placeholders, e.g.
     `/api/collection/42`. The `/api` prefix is added if you omit it.
   - `query_params` — a map for the query string. On list endpoints always pass `limit` (and
     `offset` to page) so responses stay small.
   - `body` — a JSON object for POST/PUT/PATCH writes.
   - `summary` — on a write that isn't to a card, dashboard, collection, or document, a few words in
     the user's language saying what it changed, e.g. `"Turned on nightly sync for Sample Database"`.
     It labels the step for the user.

   The response comes back as `HTTP <status>` followed by the JSON body. Read it and act on it. After
   a write to a card, dashboard, collection, or document, the line after the status says what was
   created or changed and gives the `metabase://` link to share.

Notes:
- Saving rendered results, including onto a new dashboard or document, is `save_result`'s job — see its
  description.
- To read the **rows** of a query result, use `run_warehouse_query` (or `run_warehouse_sql`, see
  "Querying the warehouse") — they return rows directly and cap them for you. Use `call_api` on query
  endpoints (e.g. `/api/dataset`) only when you specifically need the API's response shape.
- Writes are real. A `POST`/`PUT`/`DELETE` changes the instance for the current user just as the UI
  would — create things deliberately, and prefer reading (`GET`) to confirm state before mutating.
- To discover the numeric ids of databases, tables, and fields, `query_app_db` is usually faster than
  the API (see "Finding warehouse tables and columns").
