# Metabase MCP Server

Metabase includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI
clients connect directly to a Metabase instance. It uses the [Streamable HTTP
transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) and exposes
tools for searching, browsing, querying, visualizing, and creating/updating content - all scoped to the connecting
user's permissions.

## Endpoint

The MCP server is available at:

```
https://{your-metabase.example.com}/api/metabase-mcp
```

Admins turn it on with the `mcp-enabled?` setting; it also requires AI features to be enabled instance-wide.
`/api/mcp` and `/api/metabase-mcp/v2` are aliases of the same surface, kept so existing client configs
keep working.

## Connecting a client

Point any MCP-compatible client at the endpoint. For example, with Claude Code:

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

Five scopes cover the whole tool surface, chosen so a consent screen stays readable:

| Scope                  | Grants access to                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent:content:read`   | `search`, `get_content`, `browse_collection`, `browse_data`, `get_parameter_values`, `learn`, `ping_v2`                                                                                        |
| `agent:content:write`  | `question_write`, `dashboard_write`, `document_write`, `collection_write`, `metric_write`, `measure_write`, `segment_write`, `transform_write`, `duplicate_content`, `bookmark_content`        |
| `agent:query:run`      | `execute_query`, `run_saved_question`, `visualize_query`, `render_drill_through`                                                                                                               |
| `agent:sql:run`        | `execute_sql`                                                                                                                                                                                 |
| `agent:delivery:write` | `alert_write`, `subscription_write`                                                                                                                                                           |

Wildcard patterns (e.g. `agent:*`) match any scope with that prefix.

The per-entity scopes declared in [`metabase.metabot.scope`](../metabot/scope.clj) are not part of this surface -
they gate the [Agent API](../agent_api/) and Metabot. Scopes are never renamed, so a token minted against an older
surface keeps whatever strings it carries; it just won't match a tool here.

OAuth protected resource metadata is available at:

```
/.well-known/oauth-protected-resource/api/metabase-mcp
```

By default our consent screen grants access to all scopes without the opportunity to customize.

## Available tools

Tools are declared with `deftool` in [`v2/tools/`](v2/tools/) and registered in
[`v2/registry.clj`](v2/registry.clj). Individual tools can be turned off instance-wide via the
`mcp-v2-disabled-tools` setting.

### Discovery + read

| Tool                   | Description                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `search`               | Find content across the instance by relevance.                                                    |
| `get_content`          | Fetch content by `{type, id}` - the typed read for anything found via search or browse.           |
| `browse_collection`    | Browse collections structurally, including `root` and `trash`.                                    |
| `browse_data`          | Browse the data hierarchy: databases -> schemas -> tables -> fields.                              |
| `get_parameter_values` | Fetch the valid values for one filter on a dashboard or saved question.                           |
| `learn`                | Read this server's task docs (skills) for the write dialects the schemas can't fully describe.    |
| `ping_v2`              | Health check.                                                                                     |

### Query execution

| Tool                 | Description                                                            |
| -------------------- | ------------------------------------------------------------------------ |
| `execute_query`      | Validate and execute a query, returning rows plus a `query_handle`.    |
| `execute_sql`        | Execute a raw SQL string against a database, returning rows plus a handle. Requires native-query permission on the database, and the instance-level `mcp-execute-sql-enabled` setting. |
| `run_saved_question` | Run a saved question by id or entity id, returning rows inline.        |

### Visualization

These render inline in clients that advertise the `mcp-app-ui` extension; the iframe shells live in
[`v2/resources.clj`](v2/resources.clj) and render through [`ui_resource.clj`](ui_resource.clj).

| Tool                   | Description                                                          |
| ---------------------- | ---------------------------------------------------------------------- |
| `visualize_query`      | Visualize a query as an interactive chart or table.                  |
| `render_drill_through` | Render the drill-through visualization the user navigated into.      |

### Write

| Tool                 | Description                                                                        |
| -------------------- | ------------------------------------------------------------------------------------ |
| `question_write`     | Create, update, or archive a saved question or model.                              |
| `dashboard_write`    | Create or update a dashboard and edit its layout with ordered ops as one atomic save. |
| `document_write`     | Create or update a document.                                                       |
| `collection_write`   | Create, rename, move, archive, or restore a collection.                            |
| `metric_write`       | Create or update a metric.                                                         |
| `measure_write`      | Create or update a measure - a reusable aggregation attached to one table.         |
| `segment_write`      | Create or update a segment - a reusable filter attached to one table.              |
| `transform_write`    | Create or update a transform.                                                      |
| `duplicate_content`  | Copy a question, dashboard, or document into a collection.                         |
| `bookmark_content`   | Add or remove a bookmark for the calling user.                                     |
| `alert_write`        | Create or update an alert.                                                         |
| `subscription_write` | Create or update a dashboard subscription.                                         |

Result pages are bounded and paged with an opaque continuation token; read projections cap list responses and
signal truncation rather than silently dropping rows.

## Resources

The server exposes MCP [resources](https://modelcontextprotocol.io/specification/2025-03-26/server/resources) for
the `ui://` iframe shells the visualization tools render through. Every v2 resource carries a required scope, and a
UI tool reads its shell's scope from the registry so the two can never drift apart.

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

- **[`transport.clj`](transport.clj)** - Shared HTTP/JSON-RPC machinery: request framing, auth, origin checks (DNS
  rebinding protection), session handling, throttling, and JSON-vs-SSE response selection.

- **[`paths.clj`](paths.clj)** - The URL paths the server is mounted on: the canonical one plus the back-compat
  aliases. Read by both the handler and the OAuth server, so routing, RFC 9728 metadata, and RFC 8707 indicator
  matching can never drift apart.

- **[`v2/api.clj`](v2/api.clj)** - The handler. Supplies method dispatch on top of `transport/make-handler`,
  gated on `mcp-enabled?`.

- **[`v2/registry.clj`](v2/registry.clj)** - Tool registry and dispatch. `deftool` registers a tool with its Malli
  arg schema and scope; `call-tool` validates, checks scopes, dispatches, and records usage.

- **[`v2/resources.clj`](v2/resources.clj)** - The `ui://` iframe shells behind the MCP Apps tools.

- **[`scope.clj`](scope.clj)** - Scope matching. Supports exact matches, wildcard patterns, and the
  `::unrestricted` sentinel for session-based auth.

- **[`callback_api.clj`](callback_api.clj)** - Iframe callbacks mounted at `/api/embed-mcp` (feedback, query
  handles) used by the rendered visualization.

### Request flow

```
MCP client
  -> POST /api/metabase-mcp (JSON-RPC)
  -> Origin + session validation
  -> Auth: OAuth bearer token or browser session
  -> Scope check against requested tool
  -> Tool handler (registry dispatch)
  -> Response materialized as MCP content
  -> JSON or SSE back to client
```

## Further reading

- [MCP user docs](../../../docs/ai/mcp.md)
- [Agent API source](../agent_api/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
