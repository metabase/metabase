(ns metabase.mcp.models.mcp-session-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpSessionLog [_model] :mcp_session_log)

(doto :model/McpSessionLog
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-mcp-session-log!
  "Record the MCP session `row`."
  [row :- ::mcp.schema/mcp-session-log.create]
  (mcp.db/insert-session-log! row))

(mu/defn end-mcp-session-log!
  "Stamp `ended_at` on the McpSessionLog with `session-id`."
  [session-id :- :string]
  (mcp.db/end-session-log! session-id))

(mu/defn delete-mcp-session-logs-created-before!
  "Delete the McpSessionLogs created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (mcp.db/delete-session-logs-created-before! cutoff))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/McpSessionLog [_model]
  {:skip? true})
