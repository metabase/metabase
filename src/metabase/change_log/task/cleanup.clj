(ns metabase.change-log.task.cleanup
  "The hourly task that deletes the `change_log` entries older than `change-log-retention-days`."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.change-log.db :as change-log.db]
   [metabase.change-log.settings :as change-log.settings]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase.change-log.task.cleanup.job"))

(def ^:private trigger-key (triggers/key "metabase.change-log.task.cleanup.trigger"))

(defn- delete-old! []
  (change-log.db/delete-before! (t/minus (t/offset-date-time) (t/days (change-log.settings/change-log-retention-days)))))

(task/defjob ChangeLogCleanup
  "Deletes the entries of `change_log` older than `change-log-retention-days`."
  {:saved-class "metabase.change_log.task.cleanup.ChangeLogCleanup"}
  [_]
  (delete-old!))

(defmethod task/init! ::ChangeLogCleanup [_]
  (task/schedule-task!
   (jobs/build
    (jobs/of-type ChangeLogCleanup)
    (jobs/with-identity job-key))
   (triggers/build
    (triggers/with-identity trigger-key)
    (triggers/start-now)
    (triggers/with-schedule
     ;; every hour
     (cron/cron-schedule "0 17 * * * ? *")))))
