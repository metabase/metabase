(ns metabase-enterprise.mcp.init
  "Startup wiring for the enterprise MCP module: the scheduled MCP usage trimmer and the per-group tool access
  resolver."
  (:require
   [metabase-enterprise.mcp.permissions]
   [metabase-enterprise.mcp.task.mcp-usage-trimmer]))
