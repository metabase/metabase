(ns metabase.mcp.http-handler
  "What MCP adds to the application's HTTP handler."
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.core :as oauth-server]))

(def options
  "Options for [[metabase.server.core/make-handler]].
  They add MCP origins to CORS and let the session middleware accept OAuth bearer tokens.
  The fns are passed as vars, so redefining one takes effect without rebuilding the handler."
  {:cors               {:origins-fn         #'mcp/cors-origins
                        :sandbox-origin?-fn #'mcp/sandbox-origin?}
   :oauth-bearer       {:extract-token         #'oauth-server/extract-bearer-token
                        :resolve-token         #'oauth-server/resolve-access-token
                        :full-access-scope     oauth-server/full-access-scope
                        :mcp-resource?         #'oauth-server/mcp-resource?
                        :mcp-endpoint-request? #'oauth-server/mcp-endpoint-request?}})
