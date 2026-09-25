(ns metabase-enterprise.mcp.init
  "Startup wiring for the enterprise MCP module: the scheduled MCP usage trimmer, the per-group tool access
  resolver, and its settings."
  (:require
   [metabase-enterprise.mcp.permissions]
   [metabase-enterprise.mcp.settings]
   [metabase-enterprise.mcp.task.mcp-usage-trimmer]))
