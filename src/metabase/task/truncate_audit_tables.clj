(ns metabase.task.truncate-audit-tables
  "Tasks for truncating audit-related tables, particularly `audit_log`, `view_log`, and `query_execution`, based on a configured retention policy."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.task-history :as task-history]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.task :as task]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Load EE implementation if available
(when config/ee-available?
  (classloader/require 'metabase-enterprise.task.truncate-audit-tables))

(def min-retention-days
  "Minimum allowed value for `audit-max-retention-days`."
  30)

(def default-retention-days
  "Default value for `audit-max-retention-days`."
  720)

(defn log-minimum-value-warning
  "Logs a warning that the value for `audit-max-retention-days` is below the allowed minimum and will be overriden."
  [env-var-value]
  (log/warnf "MB_AUDIT_MAX_RETENTION_DAYS is set to %d; using the minimum value of %d instead."
             env-var-value
             min-retention-days))

(defsetting audit-max-retention-days
  (deferred-tru "Number of days to retain data in audit-related tables. Minimum value is 30; set to 0 to retain data indefinitely.")
  :visibility :internal
  :setter     :none
  :audit      :never
  :getter     (fn []
                (let [env-var-value (setting/get-value-of-type :integer :audit-max-retention-days)]
                  (def env-var-value env-var-value)
                  (cond
                    (nil? env-var-value)
                    default-retention-days

                    ;; Treat 0 as an alias for infinity
                    (zero? env-var-value)
                    ##Inf

                    (< env-var-value min-retention-days)
                    (do
                      (log-minimum-value-warning env-var-value)
                      min-retention-days)

                    :else
                    env-var-value))))

(defn- truncate-table!
  "Given a model, deletes all rows older than the configured threshold"
  [model time-column]
  (when-not (infinite? (audit-max-retention-days))
    (let [table-name (name (t2/table-name model))]
      (task-history/with-task-history {:task "task-history-cleanup"}
        (try
          (log/infof "Cleaning up %s table" table-name)
          (let [rows-deleted (t2/delete!
                              model
                              time-column
                              [:<= (t/minus (t/offset-date-time) (t/days (audit-max-retention-days)))])]
            (if (> rows-deleted 0)
              (log/infof "%s cleanup successful, %d rows were deleted" table-name rows-deleted)
              (log/infof "%s cleanup successful, no rows were deleted" table-name)))
          (catch Throwable e
            (log/errorf e "%s cleanup failed" table-name)))))))

(defenterprise audit-models-to-truncate
  "List of models to truncate. OSS implementation only truncates `query_execution` table."
  metabase-enterprise.task.truncate-audit-tables
  []
  [{:model :model/QueryExecution :timestamp-col :started_at}])

(defn- truncate-audit-tables!
  []
  (run!
   (fn [{:keys [model timestamp-col]}]
     (truncate-table! model timestamp-col))
   (audit-models-to-truncate)))

(jobs/defjob ^{:doc "Triggers the removal of `query_execution` rows older than the configured threshold."} TruncateAuditTables [_]
  (truncate-audit-tables!))

(def ^:private truncate-audit-tables-job-key "metabase.task.truncate-audit-tables.job")
(def ^:private truncate-audit-tables-trigger-key "metabase.task.truncate-audit-tables.trigger")
(def ^:private truncate-audit-tables-cron "0 0 */12 * * ? *") ;; Run every 12 hours

(defmethod task/init! ::TruncateAuditTables [_]
  (let [job     (jobs/build
                 (jobs/of-type TruncateAuditTables)
                 (jobs/with-identity (jobs/key truncate-audit-tables-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key truncate-audit-tables-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   (cron/schedule
                    (cron/cron-schedule truncate-audit-tables-cron)
                    (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
