(ns metabase.mcp.core
  "Public API for the MCP module. External consumers should use this namespace
   rather than reaching into internal namespaces like [[metabase.mcp.settings]]."
  (:require
   [metabase.mcp.settings :as mcp.settings]))

(defn cors-origins
  "Returns space-separated CORS origins from both common and custom MCP client settings."
  []
  (mcp.settings/mcp-apps-cors-origins))

(defn sandbox-origin?
  "Returns true if the origin matches an enabled MCP client's non-standard sandbox pattern."
  [raw-origin]
  (mcp.settings/mcp-apps-sandbox-origin? raw-origin))
