(ns metabase-enterprise.mcp.init
  "Startup wiring for the enterprise MCP module — loads the scheduled MCP usage trimmer so its
  `task/init!` runs on boot (on every EE instance, matching where MCP usage is collected)."
  (:require
   [metabase-enterprise.mcp.task.mcp-usage-trimmer]))
