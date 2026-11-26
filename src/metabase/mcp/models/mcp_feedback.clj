(ns metabase.mcp.models.mcp-feedback
  "Persist MCP Apps visualization feedback. MCP Apps have no
  metabot_conversation/metabot_message rows, so the visualization context
  (prompt + query) is stored inline rather than via a message FK."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.schema :as mcp.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpFeedback [_model] :mcp_feedback)

(doto :model/McpFeedback
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-mcp-feedback!
  "Insert the MCP Apps feedback `row`, returning the number inserted."
  [row :- ::mcp.schema/mcp-feedback.create]
  (mcp.db/insert-feedback! row))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/McpFeedback [_model]
  {:skip? false})
