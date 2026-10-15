(ns metabase.mcp.http-handler
  "What MCP adds to the application's HTTP handler."
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.core :as oauth-server]))

(def options
  "Options for [[metabase.server.core/make-handler]].
  They add MCP origins to CORS and let the session middleware accept OAuth bearer tokens and MCP UI credentials.
  The fns are passed as vars, so redefining one takes effect without rebuilding the handler."
  {:cors               {:origins-fn         #'mcp/cors-origins
                        :sandbox-origin?-fn #'mcp/sandbox-origin?}
   :oauth-bearer       {:extract-token     #'oauth-server/extract-bearer-token
                        :resolve-token     #'oauth-server/resolve-access-token
                        :full-access-scope oauth-server/full-access-scope}
   :mcp-ui-credentials {:on-surface?        #'mcp/ui-credential-on-surface?
                        :resolve-credential #'mcp/resolve-ui-credential
                        :scope-satisfied?   #'mcp/ui-credential-scope-satisfied?}})
