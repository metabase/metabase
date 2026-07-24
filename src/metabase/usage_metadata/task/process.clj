(ns metabase.usage-metadata.task.process
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.usage-metadata.batch :as usage-metadata.batch]
   [metabase.usage-metadata.candidates :as usage-metadata.candidates]
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
               :doc "Process query-history rollups and refresh Library cleanup candidates."}
  UsageMetadataProcess
  [_]
  (try
    (when (usage-metadata.settings/usage-metadata-enabled?)
      (usage-metadata.batch/run-batch!)
      nil)
    (when (premium-features/has-feature? :library)
      ;; A manual API request creates a queued run before triggering this job.
      ;; Scheduled execution creates its own run only when nothing is active.
      (when-let [run (or (usage-metadata.candidates/active-run)
                         (usage-metadata.candidates/queue-refresh! :scheduled nil))]
        (when (= :queued (:status run))
          (usage-metadata.candidates/run-refresh! run))))
    (catch Throwable e
      (log/error e "Error processing usage metadata")
      (throw e))))

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

(defn trigger-refresh!
  "Ask Quartz to execute the shared usage-metadata processing job now."
  []
  (task/trigger-now! job-key))
