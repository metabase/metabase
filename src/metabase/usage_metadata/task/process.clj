(ns metabase.usage-metadata.task.process
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.usage-metadata.batch :as usage-metadata.batch]
   [metabase.usage-metadata.settings :as usage-metadata.settings]
   [metabase.util.log :as log])
  (:import
   (java.util TimeZone)))

(set! *warn-on-reflection* true)

(defn- cron-schedule
  "Bucket dates are always UTC days; fire the cron in UTC so the schedule hour matches the UTC day we'll close out."
  [cron-spec]
  (cron/schedule
   (cron/cron-schedule cron-spec)
   (cron/in-time-zone (TimeZone/getTimeZone "UTC"))
   (cron/with-misfire-handling-instruction-do-nothing)))

(def ^:private job-key
  (jobs/key "metabase.task.usage-metadata-process.job"))

(def ^:private trigger-key
  (triggers/key "metabase.task.usage-metadata-process.trigger"))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Process usage metadata rollups from query execution history."}
  UsageMetadataProcess
  [_]
  (when (usage-metadata.settings/usage-metadata-enabled?)
    (try
      (usage-metadata.batch/run-batch!)
      (catch Throwable e
        (log/error e "Error processing usage metadata batch")
        (throw e)))))

(defn- job []
  (jobs/build
   (jobs/of-type UsageMetadataProcess)
   (jobs/with-identity job-key)))

(defn- trigger []
  (triggers/build
   (triggers/with-identity trigger-key)
   (triggers/start-now)
   (triggers/with-schedule
    (cron-schedule (usage-metadata.settings/usage-metadata-schedule)))))

(defmethod task/init! ::UsageMetadataProcess [_]
  (task/schedule-task! (job) (trigger)))
