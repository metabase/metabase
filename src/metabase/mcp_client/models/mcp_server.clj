(ns metabase.mcp-client.models.mcp-server
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpServer [_model] :mcp_server)

(doto :model/McpServer
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/McpServer
  {:provider      mi/transform-keyword
   :auth_strategy mi/transform-keyword
   :credentials   (mi/transform-encrypted-json "mcp_server.credentials")
   :oauth_client  (mi/transform-encrypted-json "mcp_server.oauth_client")})
