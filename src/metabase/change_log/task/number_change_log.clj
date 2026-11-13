(ns metabase.change-log.task.number-change-log
  "Gives `change_log` entries their monotonically increasing `position`."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.change-log.db :as change-log.db]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(def ^:private rounds 12)

(def ^:private interval-ms 5000)

(def ^:private batch-size 10000)

(def ^:private job-key (jobs/key "metabase.change-log.task.number-change-log.job"))

(def ^:private trigger-key (triggers/key "metabase.change-log.task.number-change-log.trigger"))

(defn- statement-size
  "How many entries one UPDATE numbers: 1,000, or one on MariaDB. There an update of many rows can wait for rows that
  open transactions inserted (`ids-out-of-order-test`)."
  []
  (if (change-log.db/mariadb?) 1 1000))

(defn- number-entries!
  "Numbers the committed entries that have no position. The first gets the clock in microseconds, or the next free
  position if that is higher, and the rest rise with their ids."
  []
  (when (seq (change-log.db/unnumbered-ids 1))
    (cluster-lock/with-cluster-lock ::number-entries
      (when-let [ids (seq (change-log.db/unnumbered-ids batch-size))]
        (let [start (max (* 1000 (System/currentTimeMillis))
                         (inc (or (change-log.db/highest-position) 0)))]
          (doseq [statement-ids (partition-all (statement-size) ids)]
            (change-log.db/set-positions! statement-ids start (first ids))))))))

(defn- number-change-log! [rounds interval-ms]
  (when (premium-features/enable-change-log?)
    (dotimes [round rounds]
      (when (pos? round)
        (Thread/sleep ^long interval-ms))
      (number-entries!))))

(task/defjob NumberChangeLog
  "Gives the entries of `change_log` their position."
  {:saved-class "metabase.change_log.task.number_change_log.NumberChangeLog"
   :concurrent? false}
  [_]
  (number-change-log! rounds interval-ms))

(defmethod task/init! ::NumberChangeLog [_]
  (task/schedule-task!
   (jobs/build
    (jobs/of-type NumberChangeLog)
    (jobs/with-identity job-key))
   (triggers/build
    (triggers/with-identity trigger-key)
    (triggers/start-now)
    (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule "0 * * * * ? *")
      (cron/with-misfire-handling-instruction-do-nothing))))))
