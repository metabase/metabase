(ns metabase-enterprise.audit-app.task.truncate-audit-tables
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise audit-models-to-truncate
  "List of models to truncate, as well as the name of the column containing the row's timestamp. EE version adds
  `audit_log` and `view_log` truncation.

  Note: the MCP analytics logs are intentionally *not* here — they're collected on every EE instance
  (not just `audit-app`), so their retention runs on every EE instance via the standalone
  `metabase-enterprise.mcp.task.mcp-usage-trimmer` (keyed on `ai-usage-max-retention-days`)."
  :feature :audit-app
  []
  [{:model :model/QueryExecution :timestamp-col :started_at}
   {:model :model/AuditLog       :timestamp-col :timestamp}
   {:model :model/ViewLog        :timestamp-col :timestamp}])
