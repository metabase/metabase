(ns metabase.mcp.init
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.mcp.settings]
   [metabase.mcp.task.mcp-query-handle-gc]
   [metabase.server.middleware.security :as mw.security]))

;; MCP clients (Claude, VS Code, Cursor, ...) call the API from their own origins; hand them to the
;; CORS middleware, which sits below this module in the module graph.
(mw.security/register-cors-origins-provider!
 :mcp
 {:origins-fn         mcp/cors-origins
  :sandbox-origin?-fn mcp/sandbox-origin?})
