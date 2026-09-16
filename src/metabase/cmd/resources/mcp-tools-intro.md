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

The descriptions and argument notes here are exactly what your agent sees (which is why they sound robotic). Your agent can also call the `learn` tool for longer guides on the things a tool description can't fit.

The tables don't mark arguments as required; each tool's description says what a call needs. Nested objects show up as `object`, and the argument's note describes their shape. If your client marks every argument as required, that's the strict-schema convention: send `null` for anything the description doesn't call for.

Tools are listed alphabetically. A tool marked interactive renders a chart inline in your AI client. It only works in (and only shows up in) clients that support inline visualizations. Your client may also list a helper tool that charts call for themselves; it isn't documented here.

Several tools take or return a `query_handle`. A handle stands for a query that already ran (or was validated), so your agent can visualize or save exactly that query without sending it again. By default, handles expire after 24 hours.

Your agent will use `execute_query` for anything Metabase's query language can express (counts, sums, grouping, filtering, joins) and `execute_sql` for the rest (window functions, CTEs, engine-specific functions), or when you ask for SQL outright.

The query tools take a `row_limit`. That's the page size, not a cap: longer results come back marked truncated, and `execute_query` returns a cursor for the next page.
