(ns metabase.mcp.http-handler
  "What MCP adds to the application's HTTP handler."
  (:require
   [metabase.mcp.core :as mcp]
   [metabase.oauth-server.core :as oauth-server]))

(def options
  "Options for [[metabase.server.core/make-handler]]: the MCP origins CORS allows, and the OAuth bearer tokens and MCP
  UI credentials the session middleware accepts.
  The fns are vars, so they satisfy Malli's function schema and pick up settings and redefinitions at call time."
  {:cors               {:origins-fn         #'mcp/cors-origins
                        :sandbox-origin?-fn #'mcp/sandbox-origin?}
   :oauth-bearer       {:extract-token     #'oauth-server/extract-bearer-token
                        :resolve-token     #'oauth-server/resolve-access-token
                        :full-access-scope oauth-server/full-access-scope}
   :mcp-ui-credentials {:on-surface?        #'mcp/ui-credential-on-surface?
                        :resolve-credential #'mcp/resolve-ui-credential
                        :scope-satisfied?   #'mcp/ui-credential-scope-satisfied?}})
