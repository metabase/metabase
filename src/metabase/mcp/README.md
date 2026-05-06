# Metabase MCP Server

Metabase includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that lets AI
clients connect directly to a Metabase instance. It uses the [Streamable HTTP
transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) and builds on
Metabase's [Agent API](../agent_api/) to expose tools for searching, exploring, querying, and visualizing data — all
scoped to the connecting user's permissions.

## Endpoint

The MCP server is available at:

```
https://{your-metabase.example.com}/api/mcp
```

## Connecting a client

Point any MCP-compatible client at the `/api/mcp` endpoint. For example, with Claude Code:

```sh
claude mcp add metabase https://{your-metabase.example.com}/api/mcp --transport streamable-http
```

For Claude Desktop, create a [custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
using the same URL.

For Cursor, open **Settings > MCP** and add a new server with the type set to `streamable-http` and the URL:

```
https://{your-metabase.example.com}/api/mcp
```

## Authentication

MCP clients authenticate via **OAuth 2.0**. Metabase runs its own embedded OAuth server — no external provider is
needed.

The flow for a first-time connection:

1. The client discovers Metabase's OAuth endpoints.
2. The client registers itself with Metabase.
3. The user is redirected to Metabase to log in and approve the connection.
4. The client receives an access token scoped to the user's Metabase permissions.

Browser-based sessions (cookie auth) are also supported and receive unrestricted scopes.

### Scopes

Access tokens are scoped to limit what tools a client can use:

| Scope                    | Grants access to                              |
|--------------------------|-----------------------------------------------|
| `agent:table:read`       | `get_table`, `get_table_field_values`         |
| `agent:metric:read`      | `get_metric`, `get_metric_field_values`       |
| `agent:search`           | `search`                                      |
| `agent:query:construct`  | `construct_query`                             |
| `agent:query`            | `query`                                       |
| `agent:query:execute`    | `execute_query`                               |
| `agent:visualize`        | `visualize_query`, visualize-query resource    |

Wildcard patterns (e.g. `agent:*`) match any scope with that prefix.

OAuth protected resource metadata is available at:

```
/.well-known/oauth-protected-resource/api/mcp
```

By default our consent screen grants access to all scopes without the opportunity to customize.

## Available tools

The MCP server exposes these tools, dynamically generated from the Agent API endpoint metadata:

| Tool | Description |
|------|-------------|
| `search` | Search for tables and metrics using keyword or natural language search. |
| `get_table` | Get details about a table including its fields, related tables, and metrics. |
| `get_table_field_values` | Get sample values and statistics for a field in a table. |
| `get_metric` | Get details about a metric including its queryable dimensions. |
| `get_metric_field_values` | Get sample values and statistics for a field in a metric. |
| `construct_query` | Construct a query against a table or metric. Returns an opaque query string for use with `execute_query`. |
| `execute_query` | Execute a previously constructed query and return results with column metadata. |
| `query` | Query a table or metric directly. Supports pagination via continuation tokens. |
| `visualize_query` | Visualize a previously constructed query as an interactive chart or table. |

Query results are limited to 200 rows per request. When more rows are available, the response includes a
`continuation_token` that can be passed back to fetch the next page.

## Resources (MCP Apps)

The server also exposes MCP [resources](https://modelcontextprotocol.io/specification/2025-03-26/server/resources) that
render interactive Metabase visualizations inside the client's UI.

| Resource URI | Description |
|---|---|
| `ui://metabase/visualize-query.html` | Interactive Metabase SDK visualization for a query. |

When a client calls `resources/read`, the server returns an HTML page that embeds the Metabase SDK to render a fully
interactive visualization. The `visualize_query` tool works with this resource — it returns a reference to the resource
URI along with the query to visualize, and supporting clients render the result as an embedded iframe.

Resources include CSP metadata (`_meta.ui.csp`) so clients can set appropriate Content-Security-Policy headers for the
embedded content.

## Supported JSON-RPC methods

| Method | Description |
|--------|-------------|
| `initialize` | Initialize the MCP connection. Returns server capabilities and a session ID. |
| `notifications/initialized` | Client notification that initialization is complete. |
| `tools/list` | List available tools (filtered by the token's scopes). |
| `tools/call` | Call a tool with arguments. |
| `resources/list` | List available resources (filtered by the token's scopes). |
| `resources/read` | Read a resource by URI. Requires an initialized session. |
| `ping` | Keepalive ping. |

Requests can be sent individually or as a JSON-RPC batch. The server responds with JSON or SSE depending on the
`Accept` header.

## Architecture

The implementation lives in these files:

- **[`api.clj`](api.clj)** — The HTTP handler. Parses JSON-RPC requests, validates authentication and session headers,
  enforces origin checks (DNS rebinding protection), and dispatches to the appropriate method. Supports both JSON and
  SSE response formats.

- **[`tools.clj`](tools.clj)** — Tool dispatch and manifest generation. Builds the tool list from Agent API endpoint
  metadata, checks scopes, and routes tool calls through synthetic Agent API requests.

- **[`resources.clj`](resources.clj)** — MCP resource registry and handlers. Manages UI resources (like the
  visualize-query HTML page) and their associated tools, with scope-based access control.

- **[`scope.clj`](scope.clj)** — Scope matching logic. Supports exact matches, wildcard patterns, and the
  `::unrestricted` sentinel for session-based auth.

### Request flow

```
MCP client
  → POST /api/mcp (JSON-RPC)
  → Origin + session validation
  → Auth: OAuth bearer token or browser session
  → Scope check against requested tool
  → Synthetic request to Agent API endpoint
  → Response materialized as MCP content
  → JSON or SSE back to client
```

## Further reading

- [MCP user docs](../../../docs/ai/mcp.md)
- [Agent API source](../agent_api/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
