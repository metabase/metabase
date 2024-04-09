(ns metabase-enterprise.task.truncate-audit-tables
  (:require
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise audit-models-to-truncate
  "List of models to truncate, as well as the name of the column containing the row's timestamp. EE version adds
  `audit_log` and `view_log` truncation"
  :feature :audit-app
  []
  [{:model :model/QueryExecution :timestamp-col :started_at}
   {:model :model/AuditLog       :timestamp-col :timestamp}
   {:model :model/ViewLog        :timestamp-col :timestamp}])
