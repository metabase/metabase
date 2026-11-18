(ns metabase.mcp.models.mcp-tool-call-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpToolCallLog [_model] :mcp_tool_call_log)

(doto :model/McpToolCallLog
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/McpToolCallLog [_model]
  {:skip? true})
