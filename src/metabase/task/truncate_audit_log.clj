(ns metabase.task.truncate-audit-log
  "Tasks for truncating audit log tables, such as `query_execution`, based on a configured retention policy."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time :as t]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.models.setting :as setting]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting-impl]]
   [metabase.models.task-history :as task-history]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task :as task]
   [metabase.task.truncate-audit-log.interface :as truncate-audit-log.i]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Load EE implementation if available
(u/ignore-exceptions (classloader/require 'metabase-enterprise.task.truncate-audit-log))

(define-multi-setting-impl truncate-audit-log.i/audit-max-retention-days :oss
  :getter (fn []
            (if-not (premium-features/is-hosted?)
              ##Inf
              (let [env-var-value      (setting/get-value-of-type :integer :audit-max-retention-days)
                    min-retention-days truncate-audit-log.i/min-retention-days]
                (cond
                  ((some-fn nil? zero?) env-var-value) ##Inf
                  (< env-var-value min-retention-days) (do
                                                         (truncate-audit-log.i/log-minimum-value-warning env-var-value)
                                                         min-retention-days)
                  :else                                env-var-value)))))

(defn- query-execution-cleanup!
  "Delete QueryExecution rows older than the configured threshold."
  []
  (when-not (infinite? (truncate-audit-log.i/audit-max-retention-days))
    (task-history/with-task-history {:task "task-history-cleanup"}
      (try
        (log/info (trs "Cleaning up query_execution table"))
        (let [rows-deleted (t2/delete!
                            QueryExecution
                            :started_at
                            [:<= (t/minus (t/offset-date-time) (t/days (truncate-audit-log.i/audit-max-retention-days)))])]
          (log/info
           (if (> rows-deleted 0)
             (trs "query_execution cleanup successful, {0} rows were deleted" rows-deleted)
             (trs "query_execution cleanup successful, no rows were deleted"))))
        (catch Throwable e
          (log/error e (trs "query_execution cleanup failed"))
          (throw e))))))

(jobs/defjob ^{:doc "Triggers the removal of `query_execution` rows older than the configured threshold."} TruncateAuditLog [_]
  (query-execution-cleanup!))

(def ^:private truncate-audit-log-job-key "metabase.task.truncate-audit-log.job")
(def ^:private truncate-audit-log-trigger-key "metabase.task.truncate-audit-log.trigger")
(def ^:private truncate-audit-log-cron "0 0 */12 * * ? *")

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
                    (cron/cron-schedule truncate-audit-log-cron)
                    (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
