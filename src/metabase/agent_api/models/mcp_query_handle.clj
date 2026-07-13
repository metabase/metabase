(ns metabase.agent-api.models.mcp-query-handle
  "The rows behind [[metabase.agent-api.handles]]: one stored query per (user, query), with a TTL."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpQueryHandle [_model] :mcp_query_handle)

(doto :model/McpQueryHandle
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
