(ns metabase-enterprise.audit-app.task.truncate-audit-tables
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise audit-models-to-truncate
  "List of models to truncate, as well as the name of the column containing the row's timestamp. EE version adds
  `audit_log`, `view_log`, and the MCP analytics logs (`mcp_tool_call_log`, `mcp_session_log`) truncation"
  :feature :audit-app
  []
  [{:model :model/QueryExecution :timestamp-col :started_at}
   {:model :model/AuditLog       :timestamp-col :timestamp}
   {:model :model/ViewLog        :timestamp-col :timestamp}
   {:model :model/McpToolCallLog :timestamp-col :created_at}
   {:model :model/McpSessionLog  :timestamp-col :created_at}])
