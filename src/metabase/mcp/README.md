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
| `agent:sql:execute`       | `execute_sql`                                                                                                  |
| `agent:question:create`   | `create_question`                                                                                              |
| `agent:question:update`   | `update_question` (also covers "move card to collection")                                                      |
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
| `query`           | Query a table or metric directly. Supports pagination via continuation tokens.                                                                                                                 |
| `execute_query`   | Execute a previously constructed query and return results with column metadata.                                                                                                                |
| `execute_sql`     | Execute a raw SQL query against a database. Requires the user to have native-query permission on the target database. Can be disabled instance-wide via the `mcp-execute-sql-enabled` setting. |

### Write

| Tool                | Description                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `create_question`   | Save a query as a named question (card). Accepts a `query_handle` from `construct_query`.                         |
| `update_question`   | Update a saved question. Patch semantics. Setting `collection_id` moves the card. Setting `archived` archives it. |
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
  metadata, checks scopes, and routes tool calls through synthetic Agent API requests.

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

## Further reading

- [MCP user docs](../../../docs/ai/mcp.md)
- [Agent API source](../agent_api/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
