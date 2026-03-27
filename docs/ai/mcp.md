---
title: MCP server
summary: Connect MCP-compatible AI clients to Metabase to search, explore, and query your data through the semantic layer.
---

# MCP server

![A metric viewed through an MCP client connected to Metabase](./images/metric-in-mcp.png)

Metabase includes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server (using Streamable HTTP transport) that lets AI clients connect directly to your Metabase, all scoped to the connecting person's permissions.

Before connecting, make sure AI features are enabled in your Metabase. See [AI settings](./settings.md).

## Connect an MCP client

Point your MCP client at Metabase's MCP endpoint at `/api/mcp`:

```
https://{your-metabase.example.com}/api/mcp
```

In Claude Code, for example, you can run `/mcp add metabase https://{your-metabase.example.com}/api/mcp --transport streamable-http` and Claude will handle the OAuth flow for you.

## Authentication

MCP clients authenticate with Metabase using OAuth 2.0. Metabase runs its own embedded OAuth server, so you don't need to set up an external OAuth provider.

Your MCP client should try to connect to your Metabase. You'll see a Metabase-branded consent page asking you to approve the connection to your Metabase.

A first-time connection will go something like this:

1. The client discovers Metabase's OAuth endpoints.
2. The client registers itself with Metabase.
3. You're redirected to Metabase to log in (if you aren't already) and approve the connection.
4. The client receives an access token scoped to the permissions you have in Metabase.

## Available tools

You may need to allow access to these tools in your client. The MCP server builds on Metabase's [Agent API](./agent-api.md), and exposes the following tools. If you're building a custom integration and need full control, use the [Agent API](./agent-api.md) directly instead.

- **search**: Find tables and metrics using keyword or natural language search.
- **get_table**: Get details about a table, including its fields, related tables, and metrics.
- **get_table_field_values**: Get sample values and statistics for a field in a table.
- **get_metric**: Get details about a metric, including its queryable dimensions.
- **get_metric_field_values**: Get sample values and statistics for a field in a metric.
- **query**: Query a table or metric and return results.

## Further reading

- [Agent API](./agent-api.md)
- [Metabase API docs](../api.html)
- [Model Context Protocol specification](https://modelcontextprotocol.io/)
