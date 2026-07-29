(ns metabase.mcp.models.mcp-session-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpSessionLog [_model] :mcp_session_log)

(doto :model/McpSessionLog
  (derive :metabase/model))
