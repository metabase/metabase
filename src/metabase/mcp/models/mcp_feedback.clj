(ns metabase.mcp.models.mcp-feedback
  "Persist MCP Apps visualization feedback. MCP Apps have no
  metabot_conversation/metabot_message rows, so the visualization context
  (prompt + query) is stored inline rather than via a message FK."
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/McpFeedback [_model] :mcp_feedback)

(doto :model/McpFeedback
  (derive :metabase/model))
