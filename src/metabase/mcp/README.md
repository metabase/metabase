# Metabase MCP Server

Metabase includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI
clients connect directly to a Metabase instance. It uses the [Streamable HTTP
transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) and builds on
Metabase's [Agent API](../agent_api/) to expose tools for searching, navigating, querying, visualizing, and
creating/updating content - all scoped to the connecting user's permissions.

## Endpoint

The MCP server is available at:

```
https://{your-metabase.example.com}/api/metabase-mcp
```

The legacy `/api/mcp` path still works as an alias for existing clients, but `/api/metabase-mcp` is the
canonical URL to advertise.

## Connecting a client

Point any MCP-compatible client at the `/api/metabase-mcp` endpoint. For example, with Claude Code:

```sh
claude mcp add metabase https://{your-metabase.example.com}/api/metabase-mcp --transport streamable-http
```

For Claude Desktop, create a [custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
using the same URL.

For Cursor, open **Settings > MCP** and add a new server with the type set to `streamable-http` and the URL:

```
https://{your-metabase.example.com}/api/metabase-mcp
```

## Authentication

MCP clients authenticate via **OAuth 2.0**. Metabase runs its own embedded OAuth server - no external provider is
needed.

The flow for a first-time connection:

1. The client discovers Metabase's OAuth endpoints.
2. The client registers itself with Metabase.
3. The user is redirected to Metabase to log in and approve the connection.
4. The client receives an access token scoped to the user's Metabase permissions.

Browser-based sessions (cookie auth) are also supported and receive unrestricted scopes.

### Scopes

Access tokens are scoped to limit what tools a client can use:

| Scope                     | Grants access to                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `agent:search`            | `search`                                                                                                       |
| `agent:resource:read`     | `read_resource` (always granted to any authenticated caller; per-URI perm checks happen inside the dispatcher) |
| `agent:query:construct`   | `construct_query`                                                                                              |
| `agent:query`             | `query`                                                                                                        |
| `agent:query:execute`     | `execute_query`                                                                                                |
| `agent:sql:construct`     | `construct_native_query`                                                                                       |
| `agent:sql:execute`       | `execute_sql`                                                                                                  |
| `agent:question:create`   | `create_question`                                                                                              |
| `agent:question:update`   | `update_question` (also covers "move card to collection")                                                      |
| `agent:question:execute`  | `execute_question`                                                                                             |
| `agent:metric:create`     | `create_metric`                                                                                                |
| `agent:metric:update`     | `update_metric` (also covers "move metric to collection" and archiving)                                        |
| `agent:dashboard:create`  | `create_dashboard`                                                                                             |
| `agent:dashboard:update`  | `update_dashboard`                                                                                             |
| `agent:collection:create` | `create_collection`                                                                                            |

Wildcard patterns (e.g. `agent:*`) match any scope with that prefix.

OAuth protected resource metadata is available at:

```
/.well-known/oauth-protected-resource/api/metabase-mcp
```

By default our consent screen grants access to all scopes without the opportunity to customize.

## Available tools

The MCP server exposes these tools, dynamically generated from the Agent API endpoint metadata:

### Discovery + read

| Tool            | Description                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`        | Search for tables, metrics, cards, dashboards, and collections using keyword or natural-language queries.                                                           |
| `read_resource` | Read one or more Metabase entities by `metabase://` URI. Covers database/schema/table/collection/question/dashboard/metric/transform navigation. Up to 5 URIs per call. |

### Query construction + execution

| Tool              | Description                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `construct_query` | Construct a query against a table or metric. Accepts the user's original `prompt` when available. Returns an opaque `query_handle` for use with `execute_query` or `visualize_query`.          |
| `construct_native_query` | Construct a native (raw SQL) query for a database. Returns an opaque `query_handle` to feed `create_question` and save it. Does not execute the SQL; native handles are rejected by `execute_query`/`query` (use `execute_sql` to run raw SQL). |
| `query`           | Query a table or metric directly. Supports pagination via continuation tokens.                                                                                                                 |
| `execute_query`   | Execute a previously constructed query and return results with column metadata.                                                                                                                |
| `execute_sql`     | Execute a raw SQL query against a database. Requires the user to have native-query permission on the target database. Can be disabled instance-wide via the `mcp-execute-sql-enabled` setting. |
| `execute_question` | Run a saved question by id and return its rows + column metadata. Runs under the caller's permissions. Parameterized questions are not supported (returns an error). |

### Write

| Tool                | Description                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `create_metric`     | Save a query as a reusable metric. Accepts a `query_handle` from `construct_query`. The query needs one aggregation and at most one date grouping. |
| `update_metric`     | Update a saved metric. Patch semantics. Setting `collection_id` moves it; setting `archived: true` archives it — a reversible soft delete, used when asked to delete a metric. A replacement `query` must still be a valid metric. |
| `create_question`   | Save a query as a named question (card). Accepts a `query_handle` from `construct_query` (MBQL) or `construct_native_query` (native SQL). Saving native requires native-query DB permission. |
| `update_question`   | Update a saved question. Patch semantics. Setting `collection_id` moves the card. Setting `archived` archives it. Replacing the query accepts a `construct_query` or `construct_native_query` handle. |
| `create_dashboard`  | Create a new dashboard, optionally populated with saved questions (auto-positioned on the grid).                  |
| `update_dashboard`  | Update a dashboard's metadata (name, description, collection, archived).                                          |
| `create_collection` | Create a new collection. Optionally nested under a `parent_collection_id`.                                        |

Query results are limited to 200 rows per request. When more rows are available, the response includes a
`continuation_token` that can be passed back to fetch the next page.

`read_resource` list responses cap at 25 items with `truncated` / `total` signals; drill into specific URIs to see
more, or refine via `search`.

## Resources

The server exposes MCP [resources](https://modelcontextprotocol.io/specification/2025-03-26/server/resources) so
clients can fetch supplementary content by URI without inflating tool descriptions.

| Resource URI                         | Description                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `metabase://docs/construct-query.md` | Program syntax for `construct_query` and `query`: sources, operations, operator forms, worked examples, pitfalls. |

The `read_resource` **tool** (above) uses a separate URI scheme to navigate Metabase entities (`metabase://question/{id}`,
`metabase://database/{id}/tables`, etc.). The two URI namespaces are independent: `metabase://docs/...` is for static
reference content fetched via MCP `resources/read`, while `metabase://table/...` and friends are entity URIs passed
to the `read_resource` tool.

## Supported JSON-RPC methods

| Method                      | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| `initialize`                | Initialize the MCP connection. Returns server capabilities and a session ID. |
| `notifications/initialized` | Client notification that initialization is complete.                         |
| `tools/list`                | List available tools (filtered by the token's scopes).                       |
| `tools/call`                | Call a tool with arguments.                                                  |
| `resources/list`            | List available resources (filtered by the token's scopes).                   |
| `resources/read`            | Read a resource by URI. Requires an initialized session.                     |
| `ping`                      | Keepalive ping.                                                              |

Requests can be sent individually or as a JSON-RPC batch. The server responds with JSON or SSE depending on the
`Accept` header.

## Architecture

The implementation lives in these files:

- **[`api.clj`](api.clj)** - The HTTP handler. Parses JSON-RPC requests, validates authentication and session headers,
  enforces origin checks (DNS rebinding protection), and dispatches to the appropriate method. Supports both JSON and
  SSE response formats.

- **[`tools.clj`](tools.clj)** - Tool dispatch and manifest generation. Builds the tool list from Agent API endpoint
  metadata, checks scopes, and routes tool calls through synthetic Agent API requests. `two-channel-content` is the
  v2 result shape: the data is serialized once into the text block and `structuredContent` carries only the machine
  next-step fields.

- **[`../agent_api/tools.clj`](../agent_api/tools.clj)** - The handler-facing conventions harness the v2 tool
  endpoints build on: the `_write` method-enum recipe (`MethodField` + `validate-write!`), `response_format`
  projections, the bounded list envelope with steering truncation, the complete-units-then-named-remainder budgeter,
  teaching errors, and ref ergonomics.

- **[`resources.clj`](resources.clj)** - MCP resource registry and handlers. Holds documentation resources (like
  the `construct_query` reference) keyed by URI, with scope-based access control on `resources/list` and
  `resources/read`.

- **[`scope.clj`](scope.clj)** - Scope matching logic. Supports exact matches, wildcard patterns, and the
  `::unrestricted` sentinel for session-based auth.

### Request flow

```
MCP client
  -> POST /api/metabase-mcp (JSON-RPC)
  -> Origin + session validation
  -> Auth: OAuth bearer token or browser session
  -> Scope check against requested tool
  -> Synthetic request to Agent API endpoint
  -> Response materialized as MCP content
  -> JSON or SSE back to client
```

## Permission enforcement

The invariant: **a tool can never do what the caller couldn't do in the app, because tool code never
gets the chance to skip a check.** Three rules hold it up, and a test matrix proves it.

**1. Every tool call runs as the caller's real user, through the standard endpoint stack.** A
`tools/call` becomes a synthetic in-process Ring request to an Agent API `defendpoint` handler under
the caller's `*current-user-id*`, so endpoint checks, model-level `can-read?`/`can-write?`, and the
query processor's permission middleware (sandboxing, impersonation, native-query permission) fire
exactly as they do for a browser request.

This is why tool code must not reach the app DB itself: a `t2/select` gets the row without asking
whether the caller may see it. A kondo rule (`mcp-tool-namespaces` in
[`.clj-kondo/config.edn`](../../../.clj-kondo/config.edn)) bans `toucan2.core` and the app-DB query
helpers from `metabase.mcp.*` and `metabase.agent-api.*`, excluding the MCP server's own Toucan
models under `metabase.mcp.models.*`.

**2. Share the handler, not the pattern.** Where a tool is 1:1 with a public REST endpoint, it calls
the *same domain function the public handler calls*. A parallel reimplementation is where a forgotten
`write-check` slips in — and, because the check lives in the shared function, it cannot diverge:

| Tool | Delegates to |
| --- | --- |
| `collection_write` | `collections_rest/api.clj` — `POST /`, `PUT /:id` |
| `snippet_write` | `native_query_snippets/api.clj` — `POST /`, `PUT /:id` |
| `segment_write` | `segments/api.clj` — `POST /`, `PUT /:id` |
| `measure_write` | `measures/api.clj` — `POST /`, `PUT /:id` |
| `duplicate_content` | `queries_rest/api/card.clj` `POST /:id/copy`, `dashboards_rest/api.clj` `POST /:from-dashboard-id/copy`, `documents/api/document.clj` `POST /:from-document-id/copy` |
| `bookmark_content` | `bookmarks/api.clj` — `POST /:model/:id`, `DELETE /:model/:id` |
| `revert_content` | `revisions/api.clj` — `POST /revert` |
| `add_timeline_event` | `timeline/api/timeline_event.clj` — `POST /` |
| `alert_write`, `subscription_write` | `notification/api/notification.clj` — `POST /` |

Workflow tools (`dashboard_write`'s ops, `browse_data`) compose several such calls in-process, each
carrying its own check. [[metabase.agent-api.tools/run-ops!]] applies them in order and aborts the
whole call on the first failure, naming the op's index.

**3. Same path, same side effects.** View logs, recent items, and usage analytics only stay correct
if a tool read leaves the trail a browser read leaves. [[metabase.agent-api.tools/publish-read-event!]]
publishes the `:event/*-read` event that the entity's REST read endpoint publishes, with the same
payload. Cards have no entry: a card's REST read publishes nothing, and `:event/card-read` comes from
the query processor when the card is *run*.

**The permission-parity matrix** (`metabase.mcp.permission-parity-test`, plus the sandboxing rows in
`metabase-enterprise.mcp.permission-parity-test`) is the backstop. Each row calls a tool and the
public REST endpoint it stands in for, as the same user under one permission scenario — blocked
database, no collection access, no native-query permission, read-only collection, archived target,
sandboxed user — and asserts the two give the same answer. Adding a tool means adding its rows with
`check-parity!`. The release gate is zero discrepancies.

### Reviewing a tool

- Does it delegate to the domain function the public handler calls, or reimplement it?
- Does it touch Toucan or the app DB? (The linter says no. Silencing the linter is not the fix.)
- Does a read publish the read event its REST endpoint publishes?
- Does a workflow tool abort the whole call on a failed op, rather than half-applying?
- Are there parity rows for its denial scenarios?

## Further reading

- [MCP user docs](../../../docs/ai/mcp.md)
- [Agent API source](../agent_api/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
