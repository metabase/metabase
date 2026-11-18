(ns metabase.mcp.models.mcp-query-handle
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpQueryHandle [_model] :mcp_query_handle)

(doto :model/McpQueryHandle
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(defmethod app-db-copy/spec :model/McpQueryHandle [_model]
  {:skip? true})
