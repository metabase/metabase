(ns metabase.task.truncate-audit-tables
  "Tasks for truncating audit-related tables, particularly `audit_log`, `view_log`, and `query_execution`, based on a configured retention policy."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.models.setting :as setting]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting-impl]]
   [metabase.models.task-history :as task-history]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.task :as task]
   [metabase.task.truncate-audit-tables.interface
    :as truncate-audit-tables.i]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Load EE implementation if available
(when config/ee-available?
  (classloader/require 'metabase-enterprise.task.truncate-audit-tables))

(define-multi-setting-impl truncate-audit-tables.i/audit-max-retention-days :oss
  :getter (fn []
            (if-not (premium-features/is-hosted?)
              ##Inf
              (let [env-var-value      (setting/get-value-of-type :integer :audit-max-retention-days)
                    min-retention-days truncate-audit-tables.i/min-retention-days]
                (cond
                  ((some-fn nil? zero?) env-var-value) ##Inf
                  (< env-var-value min-retention-days) (do
                                                         (truncate-audit-tables.i/log-minimum-value-warning env-var-value)
                                                         min-retention-days)
                  :else                                env-var-value)))))

(defn- truncate-table!
  "Given a model, deletes all rows older than the configured threshold"
  [model time-column]
  (when-not (infinite? (truncate-audit-tables.i/audit-max-retention-days))
    (let [table-name (name (t2/table-name model))]
      (task-history/with-task-history {:task "task-history-cleanup"}
        (try
          (log/infof "Cleaning up %s table" table-name)
          (let [rows-deleted (t2/delete!
                              model
                              time-column
                              [:<= (t/minus (t/offset-date-time) (t/days (truncate-audit-tables.i/audit-max-retention-days)))])]
            (if (> rows-deleted 0)
              (log/infof "%s cleanup successful, %d rows were deleted" table-name rows-deleted)
              (log/infof "%s cleanup successful, no rows were deleted" table-name)))
          (catch Throwable e
            (log/errorf e "%s cleanup failed" table-name)))))))

(defenterprise audit-models-to-truncate
  "List of models to truncate. OSS implementation only truncates `query_execution` table."
  metabase-enterprise.task.truncate-audit-tables
  []
  {:model/QueryExecution :started_at})

(defn- truncate-audit-tables!
  []
  (dorun
   (map
    (fn [[model time-column]]
      (truncate-table! model time-column))
    (audit-models-to-truncate))))

(jobs/defjob ^{:doc "Triggers the removal of `query_execution` rows older than the configured threshold."} TruncateAuditTables [_]
  (truncate-audit-tables!))

(def ^:private truncate-audit-tables-job-key "metabase.task.truncate-audit-tables.job")
(def ^:private truncate-audit-tables-trigger-key "metabase.task.truncate-audit-tables.trigger")
(def ^:private truncate-audit-tables-cron "0 0 */12 * * ? *")

(defmethod task/init! ::TruncateAuditTables [_]
  (let [job     (jobs/build
                 (jobs/of-type TruncateAuditTables)
                 (jobs/with-identity (jobs/key truncate-audit-tables-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key truncate-audit-tables-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   (cron/schedule
                    ;; run every 12 hours
                    (cron/cron-schedule truncate-audit-tables-cron)
                    (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
