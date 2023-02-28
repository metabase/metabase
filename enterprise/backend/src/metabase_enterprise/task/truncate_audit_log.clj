(ns metabase-enterprise.task.truncate-audit-log
  "EE implementation of the `audit-max-retention-days` setting, used to determine the retention policy for audit tables."
  (:require
   [metabase.models.setting :as setting]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting-impl]]
   [metabase.task.truncate-audit-log.interface :as truncate-audit-log.i]))

(define-multi-setting-impl truncate-audit-log.i/audit-max-retention-days :ee
  :getter (fn []
            (let [env-var-value      (setting/get-value-of-type :integer :audit-max-retention-days)
                  min-retention-days truncate-audit-log.i/min-retention-days]
              (cond
                (nil? env-var-value)   ##Inf
                (zero? env-var-value)  ##Inf
                (< env-var-value
                   min-retention-days) (do
                                         (truncate-audit-log.i/log-minimum-value-warning env-var-value)
                                         min-retention-days)
                :else                  env-var-value))))
