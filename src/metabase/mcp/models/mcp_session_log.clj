(ns metabase.mcp.models.mcp-session-log
  (:require
   [metabase.toucan.core :as t2]))

(t2/define-table-name :model/McpSessionLog [_model] :mcp_session_log)

(doto :model/McpSessionLog
  (derive :metabase/model))
