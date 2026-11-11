(ns metabase.mcp.models.mcp-tool-call-log
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/McpToolCallLog [_model] :mcp_tool_call_log)

(doto :model/McpToolCallLog
  (derive :metabase/model))
