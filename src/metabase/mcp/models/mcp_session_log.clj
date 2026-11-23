(ns metabase.mcp.models.mcp-session-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
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

(mu/defn delete-mcp-session-logs! :- ms/IntGreaterThanOrEqualToZero
  "Delete the McpSessionLogs with `ids` in one transaction, returning the number deleted."
  [ids :- [:sequential :string]]
  (if (empty? ids)
    0
    (t2/with-transaction [_conn]
      (transduce (map (comp mcp.db/delete-session-logs! vec)) + 0 (partition-all app-db/delete-partition-size ids)))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/McpSessionLog [_model]
  {:skip? true})
