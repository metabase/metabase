(ns metabase.mcp-client.models.mcp-connection
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpConnection [_model] :mcp_connection)

(doto :model/McpConnection
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/McpConnection
  {:status        mi/transform-keyword
   :access_token  (mi/transform-encrypted-text "mcp_connection.access_token")
   :refresh_token (mi/transform-encrypted-text "mcp_connection.refresh_token")
   :scopes        mi/transform-json
   :account       mi/transform-json
   :oauth_pending (mi/transform-encrypted-json "mcp_connection.oauth_pending")})
