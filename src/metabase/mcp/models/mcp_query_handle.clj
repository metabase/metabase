(ns metabase.mcp.models.mcp-query-handle
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpQueryHandle [_model] :mcp_query_handle)

(doto :model/McpQueryHandle
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
