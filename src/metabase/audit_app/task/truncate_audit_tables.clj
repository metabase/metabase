(ns metabase.audit-app.task.truncate-audit-tables
  "Tasks for truncating audit-related tables, particularly `audit_log`, `view_log`, and `query_execution`, based on a
  configured retention policy."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.settings :as audit-app.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- truncate-table-batched!
  [table-name time-column]
  (t2/query-one
   (case (mdb/db-type)
     (:postgres :h2)
     {:delete-from (keyword table-name)
      :where [:in
              :id
              {:select [:id]
               :from (keyword table-name)
               :where [:<=
                       (keyword time-column)
                       (t/minus (t/offset-date-time) (t/days (audit-app.settings/audit-max-retention-days)))]
               :order-by [[:id :asc]]
               :limit (audit-app.settings/audit-table-truncation-batch-size)}]}

     (:mysql :mariadb)
     {:delete-from (keyword table-name)
      :where [:<=
              (keyword time-column)
              (t/minus (t/offset-date-time) (t/days (audit-app.settings/audit-max-retention-days)))]
      :limit (audit-app.settings/audit-table-truncation-batch-size)})))

(defn- truncate-table!
  "Given a model, deletes all rows older than the configured threshold"
  [model time-column]
  (when-not (infinite? (audit-app.settings/audit-max-retention-days))
    (let [table-name (name (t2/table-name model))]
      (tracing/with-span :tasks "task.audit-cleanup.table" {:audit/table       table-name
                                                            :audit/time-column (name time-column)
                                                            :db/type           (name (mdb/db-type))}
        (try
          (log/infof "Cleaning up %s table" table-name)
          (loop [total-rows-deleted 0]
            (let [batch-rows-deleted (truncate-table-batched! table-name time-column)]
              ;; Only try to delete another batch if the last batch was full
              (if (= batch-rows-deleted (audit-app.settings/audit-table-truncation-batch-size))
                (recur (+ total-rows-deleted (long batch-rows-deleted)))
                (if (not= total-rows-deleted 0)
                  (log/infof "%s cleanup successful, %d rows were deleted" table-name total-rows-deleted)
                  (log/infof "%s cleanup successful, no rows were deleted" table-name)))))
          (catch Throwable e
            (log/errorf e "%s cleanup failed" table-name)))))))

(defenterprise audit-models-to-truncate
  "List of models to truncate. OSS implementation only truncates `query_execution` table."
  metabase-enterprise.audit-app.task.truncate-audit-tables
  []
  [{:model :model/QueryExecution :timestamp-col :started_at}])

(defn- truncate-audit-tables!
  []
  (run!
   (fn [{:keys [model timestamp-col]}]
     (task-history/with-task-history {:task "task-history-cleanup"}
       (truncate-table! model timestamp-col)))
   (audit-models-to-truncate)))

(task/defjob ^{:doc "Triggers the removal of `query_execution` rows older than the configured threshold."} TruncateAuditTables [_]
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
