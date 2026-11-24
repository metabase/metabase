(ns metabase.mcp.models.mcp-tool-call-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpToolCallLog [_model] :mcp_tool_call_log)

(doto :model/McpToolCallLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-mcp-tool-call-log!
  "Record the MCP tool call `row`."
  [row :- ::mcp.schema/mcp-tool-call-log.create]
  (mcp.db/insert-tool-call-log! row))

(mu/defn delete-mcp-tool-call-logs! :- :nil
  "Delete the McpToolCallLogs with `ids` in one transaction."
  [ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/McpToolCallLog ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/McpToolCallLog [_model]
  {:skip? true})
