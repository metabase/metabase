(ns metabase.change-log.task.cleanup
  "The task that deletes the `change_log` entries older than 30 days. Like the task that truncates the audit tables
  (`metabase.audit-app.task.truncate-audit-tables`), it runs every 12 hours and deletes in batches."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.change-log.db :as change-log.db]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(def ^:private retention-days 30)

(def ^:private job-key (jobs/key "metabase.change-log.task.cleanup.job"))

(def ^:private trigger-key (triggers/key "metabase.change-log.task.cleanup.trigger"))

(defn- delete-old! [batch-size]
  (let [cutoff (t/minus (t/offset-date-time) (t/days retention-days))]
    (loop []
      (when (= batch-size (change-log.db/delete-before! cutoff batch-size))
        (recur)))))

(task/defjob ChangeLogCleanup
  "Deletes the entries of `change_log` older than 30 days."
  {:saved-class "metabase.change_log.task.cleanup.ChangeLogCleanup"}
  [_]
  (delete-old! 1000))

(defmethod task/init! ::ChangeLogCleanup [_]
  (task/schedule-task!
   (jobs/build
    (jobs/of-type ChangeLogCleanup)
    (jobs/with-identity job-key))
   (triggers/build
    (triggers/with-identity trigger-key)
    (triggers/start-now)
    (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule "0 0 */12 * * ? *")
      (cron/with-misfire-handling-instruction-do-nothing))))))
