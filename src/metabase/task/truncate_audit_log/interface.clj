(ns metabase.task.truncate-audit-log.interface
  "Common definitions for the OSS and EE implementations of `truncate-audit-log`"
  (:require
   [metabase.config :as config]
   [metabase.models.setting.multi-setting :refer [define-multi-setting]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util.i18n :refer [deferred-tru trs]]
   [metabase.util.log :as log]))

(define-multi-setting audit-max-retention-days
  (deferred-tru "Retention policy for the `query_execution` table.")
  (fn [] (if (and config/ee-available? (premium-features/enable-advanced-config?)) :ee :oss))
  :visibility :internal
  :setter     :none)

(def min-retention-days
  "Minimum allowed value for `audit-max-retention-days`."
  30)

(defn log-minimum-value-warning
  "Logs a warning that the value for `audit-max-retention-days` is below the allowed minimum and will be overriden."
  [env-var-value]
  (log/warn (trs "MB_AUDIT_MAX_RETENTION_DAYS is set to {0}; using the minimum value of {1} instead."
                 env-var-value
                 min-retention-days)))
