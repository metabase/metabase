(ns metabase-enterprise.task.truncate-audit-tables
  "EE implementation of the `audit-max-retention-days` setting, used to determine the retention policy for audit tables."
  (:require
   [metabase.models.setting :as setting]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting-impl]]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.task.truncate-audit-tables.interface
    :as
    truncate-audit-tables.i]))

(defenterprise audit-models-to-truncate
  "List of models to truncate, as well as the name of the column containing the row's timestamp. EE version adds
  `audit_log` and `view_log` truncation"
  :feature :audit-app
  []
  {:model/QueryExecution :started_at
   :model/AuditLog       :timestamp
   :model/ViewLog        :timestamp})

(define-multi-setting-impl truncate-audit-tables.i/audit-max-retention-days :ee
  :getter (fn []
            (let [env-var-value      (setting/get-value-of-type :integer :audit-max-retention-days)
                  min-retention-days truncate-audit-tables.i/min-retention-days]
              (cond
                (nil? env-var-value)   ##Inf
                (zero? env-var-value)  ##Inf
                (< env-var-value
                   min-retention-days) (do
                                         (truncate-audit-tables.i/log-minimum-value-warning env-var-value)
                                         min-retention-days)
                :else                  env-var-value))))
