---
title: MCP server tools
summary: The tools Metabase's MCP server exposes to AI clients, the permission each one needs, and the arguments each one takes.
---

# MCP server tools

_This documentation was generated from source by running:_

```
clojure -M:ee:doc mcp-tools-documentation
```

These are the tools an AI client can call once you've [connected it to your Metabase's MCP server](./mcp.md). Every tool runs as you, scoped to your permissions, so a tool can never reach data you couldn't see in Metabase yourself.

Some clients (like Claude Desktop) ask you to approve or block each tool the first time it's used.

The descriptions and argument notes here are exactly what your agent sees (which is why they sound robotic). Your agent can also call the `learn` tool to learn more about things like query dialect, native query parameters, dashboard filters, and visualization settings.
