(ns metabase-enterprise.task.truncate-audit-log
  "EE implementation of the `audit-max-retention-days` setting, used to determine the retention policy for audit tables."
  (:require
   [metabase.models.setting :as setting]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting-impl]]
   [metabase.task.truncate-audit-log :as task.truncate-audit-log]))

(define-multi-setting-impl task.truncate-audit-log/audit-max-retention-days :ee
  :getter (fn []
            (let [env-var-value (setting/get-value-of-type :integer :audit-max-retention-days)]
              (cond
                (nil? env-var-value)  ##Inf
                (zero? env-var-value) ##Inf
                (< env-var-value 30)  30
                :else                 env-var-value))))
