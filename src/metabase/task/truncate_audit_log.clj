(ns metabase.task.truncate-audit-log
  "Tasks for truncating audit log tables, such as `query_execution`, based on a configured retention policy."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.config :as config]
   [metabase.models.setting :as setting]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting define-multi-setting-impl]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task :as task]
   [metabase.util.i18n :refer [deferred-tru trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(define-multi-setting audit-max-retention-days
  (deferred-tru "Retention policy for the `query_execution` table.")
  (fn [] (if (and config/ee-available? (premium-features/enable-advanced-config?)) :ee :oss))
  :visibility :internal
  :setter     :none)

(define-multi-setting-impl audit-max-retention-days :oss
  :getter (fn []
            (if-not (premium-features/is-hosted?)
              ##Inf
              (let [env-var-value (setting/get-value-of-type :integer :audit-max-retention-days)]
                  (cond
                    (nil? env-var-value)  365
                    (zero? env-var-value) ##Inf
                    (< env-var-value 30)  30
                    :else                 env-var-value)))))

(jobs/defjob ^{:doc "Triggers the removal of `query_execution` rows older than the configured threshold."} TruncateAuditLog [_]
  (try
    (when-not (infinite? (audit-max-retention-days))
      (t2/delete! {:where [:< :started_at [:date_add [:now] [:interval (audit-max-retention-days) :day]]]}))
    (catch Throwable e
      (log/error e (trs "TruncateAuditLog task failed")))))

(def ^:private truncate-audit-log-job-key "metabase.task.truncate-audit-log.job")
(def ^:private truncate-audit-log-trigger-key "metabase.task.truncate-audit-log.trigger")

(defmethod task/init! ::TruncateAuditLog [_]
  (let [job     (jobs/build
                 (jobs/of-type TruncateAuditLog)
                 (jobs/with-identity (jobs/key truncate-audit-log-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key truncate-audit-log-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   (cron/schedule
                    ;; run every 12 hours
                    (cron/cron-schedule "0 0 */12 * * ? *")
                    (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
