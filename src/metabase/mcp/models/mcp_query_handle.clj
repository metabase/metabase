(ns metabase.mcp.models.mcp-query-handle
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/McpQueryHandle [_model] :mcp_query_handle)

(doto :model/McpQueryHandle
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
