(ns metabase.mcp.models.mcp-session-log
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/McpSessionLog [_model] :mcp_session_log)

(doto :model/McpSessionLog
  (derive :metabase/model))

(defmethod app-db-copy/spec :model/McpSessionLog [_model]
  {:skip? true})
