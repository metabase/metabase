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

| Scope | Tools it grants |
| ----- | --------------- |
| `agent:content:read` | `browse_collection`, `browse_data`, `get_content`, `get_parameter_values`, `learn`, `ping_v2`, `search` |
| `agent:content:write` | `bookmark_content`, `collection_write`, `dashboard_write`, `document_write`, `duplicate_content`, `measure_write`, `metric_write`, `question_write`, `segment_write`, `transform_write` |
| `agent:delivery:write` | `alert_write`, `subscription_write` |
| `agent:query:run` | `execute_query`, `refresh_ui_credential`, `render_drill_through`, `run_saved_question`, `visualize_query` |
| `agent:sql:run` | `execute_sql` |

Wildcard patterns (e.g. `agent:*`) match any scope with that prefix.

OAuth protected resource metadata is available at:

```
/.well-known/oauth-protected-resource/api/metabase-mcp
```

By default our consent screen grants access to all scopes without the opportunity to customize.

## Available tools

Generated from the v2 registry (`deftool`); every tool is gated by the single scope named here, and a
token missing it neither sees the tool in `tools/list` nor may call it.

| Tool | Scope | Description |
| ---- | ----- | ----------- |
| `alert_write` | `agent:delivery:write` | Create or update an alert: a notification sent on a schedule when a saved question's results meet a condition. |
| `bookmark_content` | `agent:content:write` | Add or remove a bookmark on content for the calling user — the same starred/favorites list the Metabase sidebar shows. |
| `browse_collection` | `agent:content:read` | Browse collections structurally — one uniform id over every partition: a numeric id, a 21-char entity_id, "root" (re-rooted per namespace), or "trash" (archived content, items mode only). |
| `browse_data` | `agent:content:read` | Browse the data hierarchy: databases → schemas → tables → fields. |
| `collection_write` | `agent:content:write` | Create, rename, move, archive, or restore a collection — the folders that hold questions, dashboards, models, and documents. |
| `dashboard_write` | `agent:content:write` | Create or update a dashboard and edit its layout with ordered ops. |
| `document_write` | `agent:content:write` | Create or update a document. |
| `duplicate_content` | `agent:content:write` | Copy a question, dashboard, or document into a collection — cheaper and safer than reading the original and re-creating it, and it preserves everything the read projections leave out. |
| `execute_query` | `agent:query:run` | Validate and execute a query, returning rows plus a query_handle. |
| `execute_sql` | `agent:sql:run` | Execute a raw SQL string against a database, returning rows plus a query_handle. |
| `get_content` | `agent:content:read` | Fetch content by {type, id} — the typed read for anything found via search or browse_collection. |
| `get_parameter_values` | `agent:content:read` | Fetch the valid values for one filter on a dashboard or saved question, so you filter with real values instead of guessing. |
| `learn` | `agent:content:read` | Read this server's task docs (skills) for the write dialects the schemas can't fully describe. |
| `measure_write` | `agent:content:write` | Create or update a measure: a named, reusable MBQL aggregation attached to one table, referenced inside another query's aggregation as ["measure", id]. |
| `metric_write` | `agent:content:write` | Create or update a metric: a saved, reusable aggregation that lives in a collection and can be queried on its own or referenced from other queries. |
| `ping_v2` | `agent:content:read` | Health-check tool for the MCP surface. |
| `question_write` | `agent:content:write` | Create, update, or archive a saved question or model. |
| `refresh_ui_credential` | `agent:query:run` | Refresh the scoped credential used by a Metabase MCP App. |
| `render_drill_through` | `agent:query:run` | Render the drill-through visualization the user just navigated into. |
| `run_saved_question` | `agent:query:run` | Run a saved question (card) by numeric id or entity_id, returning rows inline. |
| `search` | `agent:content:read` | Find content across the Metabase instance by relevance. |
| `segment_write` | `agent:content:write` | Create or update a segment: a named, reusable MBQL filter attached to one table, referenced from other queries' filters. |
| `subscription_write` | `agent:delivery:write` | Create or update a dashboard subscription — scheduled delivery of a whole dashboard, e.g. |
| `transform_write` | `agent:content:write` | Create or update a transform: a saved query that Metabase runs to materialize its results into a real table in your warehouse, which questions and other transforms can then query. |
| `visualize_query` | `agent:query:run` | Visualize a query as an interactive chart or table, rendered inline in the conversation. |

Query results are limited to 200 rows per request. When more rows are available, the response includes a
`continuation_token` that can be passed back to fetch the next page.

## Resources

The server exposes MCP [resources](https://modelcontextprotocol.io/specification/2025-03-26/server/resources) so
clients can fetch supplementary content by URI without inflating tool descriptions.

| Resource URI | Description |
| ------------ | ----------- |
| `ui://metabase/visualize-query.html` | The MCP Apps iframe shell `visualize_query` points a capable client at. |
| `ui://metabase/render-drill-through.html` | The shell `render_drill_through` points at. |

Skill packs are delivered through the `learn` tool rather than as resources.

Entity navigation is done with the `get_content` and `browse_*` tools rather than a URI scheme; the `ui://`
resources above exist only so a client that can render an iframe has something to mount.

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

- **[`transport.clj`](transport.clj)** - The HTTP transport. Parses JSON-RPC requests, validates authentication and
  session headers, enforces origin checks (DNS rebinding protection), and dispatches to the appropriate method.
  Supports both JSON and SSE response formats.

- **[`v2/api.clj`](v2/api.clj)** - The tool surface handler. Wires the transport to the v2 tool + resource registries
  and defines method dispatch (`tools/list`, `tools/call`, `resources/list`, `resources/read`, `ping`).

- **[`v2/registry.clj`](v2/registry.clj)** - The v2 tool registry. Tools self-register via `deftool`; the registry
  checks scopes, validates arguments, dispatches calls, and records usage.

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

## Further reading

- [MCP user docs](../../../docs/ai/mcp.md)
- [Agent API source](../agent_api/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
