(ns metabase.mcp.init
  (:require
   [metabase.mcp.resources]
   [metabase.mcp.settings]
   [metabase.mcp.skills :as mcp.skills]
   [metabase.mcp.toolsets]))

(mcp.skills/register-skills!)
