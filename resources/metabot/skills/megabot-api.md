---
id: megabot-api
title: Calling the Metabase REST API
description: How to use call_api (with list_api_endpoints and describe_api_endpoint) to do anything the product can do — save questions, build dashboards, run actions, manage collections, trigger sync, create alerts, send a chart to Slack or email.
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

2. **Check its shape.** Call `describe_api_endpoint` with that `path` (and optional `method`) to see
   the query parameters, request body, and response schema before you build the call.

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

## Sending a chart to Slack or email

For a one-off send of a saved question (send it now, no schedule), use `POST /api/pulse/test`.
Save the chart first with `save_result` if it isn't saved yet — you need a card id.

```json
{
  "name": "Top users by token spend",
  "cards": [{"id": 42509, "include_csv": false, "include_xls": false}],
  "channels": [{"channel_type": "slack", "details": {"channel": "#analytics"},
                "enabled": true, "schedule_type": "hourly"}],
  "alert_condition": "rows"
}
```

- **`alert_condition: "rows"` is required whenever there is no `dashboard_id`.** A card-only pulse
  is treated as an alert, and without a condition it defaults to a goal check that fails for any
  chart without a goal line. The endpoint still answers `{"ok": true}` — the failure is only logged
  and nothing is delivered.
- `{"ok": true}` confirms the request was accepted, not that the message arrived. Say it was sent,
  but if the user reports nothing arrived, check the Slack integration with
  `GET /api/pulse/form_input` (`channels.slack.configured`) and that the channel is one of
  `channels.slack.fields[0].options`.
- Slack: `details.channel` is the channel name with the leading `#` (or `@name` for a person).
  Pick it from `GET /api/pulse/form_input`; the bot can only post to channels it has been added to.
- Email: `"channel_type": "email"` with `"recipients": [{"email": "a@b.com"}]` or `[{"id": <user id>}]`
  instead of `details`.
- To send a whole dashboard, pass `dashboard_id` plus its cards; no `alert_condition` is needed then.
- For a recurring subscription rather than a one-off send, create it with `POST /api/pulse`
  (dashboards) or `POST /api/notification` (card alerts) instead.
