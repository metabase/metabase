(ns metabase-enterprise.data-complexity-score.task.complexity-score-trimmer
  "Scheduled task to delete old Data Complexity Score snapshots."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Timestamp)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key
  (jobs/key "metabase.task.data-complexity-score-trimmer.trim.job"))

(def ^:private trigger-key
  (triggers/key "metabase.task.data-complexity-score-trimmer.trim.trigger"))

(def ^:private retention-months 3)

(defn- retention-cutoff-timestamp
  [months]
  (Timestamp/valueOf ^java.time.LocalDateTime
   (t/minus (t/local-date-time) (t/months months))))

(defn- trim-old-complexity-score-data!
  []
  (log/info "Trimming old Data Complexity Score snapshots.")
  (let [cutoff  (retention-cutoff-timestamp retention-months)
        deleted (t2/delete! :model/DataComplexityScore {:where [:< :created_at cutoff]})]
    (log/infof "Data Complexity Score cleanup complete. Deleted %d rows." (or deleted 0))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete old Data Complexity Score snapshots"}
  DataComplexityScoreTrimmer [_ctx]
  (trim-old-complexity-score-data!))

(defmethod task/init! ::DataComplexityScoreTrimmer [_]
  (let [job     (jobs/build
                 (jobs/of-type DataComplexityScoreTrimmer)
                 (jobs/store-durably)
                 (jobs/with-identity job-key)
                 (jobs/with-description "Data Complexity Score cleanup"))
        ;; 03:43 UTC — separate from the scoring run, still off-hour.
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule "0 43 3 * * ? *")
                   (cron/in-time-zone (java.util.TimeZone/getTimeZone "UTC"))
                   (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
