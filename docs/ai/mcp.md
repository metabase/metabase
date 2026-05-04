---
title: MCP server
summary: Connect MCP-compatible AI clients to Metabase to search, explore, and query your data through the semantic layer.
---

# MCP server

![A metric viewed through an MCP client connected to Metabase](./images/metric-in-mcp.png)

Metabase includes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server (using Streamable HTTP transport) that lets AI clients connect directly to your Metabase, all scoped to the connecting person's permissions.

## Connect an MCP client

If your admin has turned on [your Metabase's MCP server](./settings.md#enable-mcp-server), all you need to do is point your MCP client at Metabase's MCP endpoint, `/api/mcp`. For example:

```
https://{your-metabase.example.com}/api/mcp
```

In Claude Code, for example, you can run `/mcp add metabase https://{your-metabase.example.com}/api/mcp --transport streamable-http` and Claude will handle the OAuth flow for you.

For Claude Desktop, you can create a [custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) by just giving it that URL to your Metabase's mcp endpoint.

## Authentication

MCP clients authenticate with Metabase using OAuth 2.0. Metabase runs its own embedded OAuth server, so you don't need to set up an external OAuth provider.

Your MCP client should try to connect to your Metabase. You'll see a Metabase-branded consent page asking you to approve the connection to your Metabase.

A first-time connection will go something like this:

1. The client discovers Metabase's OAuth endpoints.
2. The client registers itself with Metabase.
3. You're redirected to Metabase to log in (if you aren't already) and approve the connection.
4. The client receives an access token scoped to the permissions you have in Metabase.

Results returned by the MCP server are sent to your MCP client, which may forward them to an AI provider depending on how the client is configured. See [Privacy](./settings.md#privacy).

### Site URL must match the URL your client uses

For containerized setups, like when testing locally, you may need to set the `MB_SITE_URL` environment variable to the URL you point to. For example, if you're playing around with a Metabase on localhost:

```
MB_SITE_URL: http://localhost:3000
```

Some explanation: OAuth discovery starts with Metabase returning a `WWW-Authenticate` header whose `resource_metadata` URL is built from your **Site URL** setting in **Admin** > **Settings** > **General** (or via the environment variable).

If the site URL doesn't match an address your MCP client can reach, like if you're running Metabase in Docker and the site URL got auto-detected from an internal hostname like `metabase-dev:3000`, the client will register but fail the handshake. Your MCP client will typically report a connection failure rather than prompting you to authenticate (for example, Claude Code shows `✗ Failed to connect` rather than `! Needs authentication`).

## Available tools

Some clients (like Claude Desktop) will ask you to approve each tool the first time it's used. The MCP server builds on Metabase's [Agent API](./agent-api.md), and exposes the following tools. If you're building a custom integration and need full control, use the [Agent API](./agent-api.md) directly instead.

- **search**: Find tables and metrics using keyword or natural language search.
- **get_table**: Get details about a table, including its fields, related tables, and metrics.
- **get_table_field_values**: Get sample values and statistics for a field in a table.
- **get_metric**: Get details about a metric, including its queryable dimensions.
- **get_metric_field_values**: Get sample values and statistics for a field in a metric.
- **construct_query**: Construct a query against a table or metric. Returns an opaque query string that can be executed with `execute_query`.
- **execute_query**: Execute a previously constructed query and return the results with column metadata, row count, and execution time.
- **query**: Query a table or metric and return results.

## Use the MCP server with file-based development

You can use the MCP server to help you create Metabase content as serialized YAML files that you can import into your Metabase. Point your agent at the MCP server to give it access to your Metabase's database metadata (table names, fields, and sample values) so it can write questions and dashboards that point at real columns.

See [File-based development](./file-based-development.md).

## Further reading

- [Agent API](./agent-api.md)
- [File-based development](./file-based-development.md)
- [Metabase API docs](../api.html)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
