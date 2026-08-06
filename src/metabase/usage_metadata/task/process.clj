(ns metabase.usage-metadata.task.process
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.usage-metadata.batch :as usage-metadata.batch]
   [metabase.usage-metadata.candidate-service :as candidate-service]
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

(defn- run-step
  [message f]
  (try
    (f)
    nil
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (log/error e message)
      e)))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Process query-history rollups and refresh Library cleanup candidates."}
  UsageMetadataProcess
  [_]
  (let [batch-error
        (when (usage-metadata.settings/usage-metadata-enabled?)
          (run-step "Error processing usage metadata rollups"
                    usage-metadata.batch/run-batch!))
        candidate-error
        (when (premium-features/has-feature? :library)
          (run-step
           "Error refreshing usage metadata candidates"
           (fn []
             ;; `queue-refresh!` also recovers runs interrupted by a previous process, so every
             ;; scheduled tick must go through it rather than short-circuiting on `active-run`.
             (when-let [run (candidate-service/queue-refresh! :scheduled nil)]
               (candidate-service/run-refresh! run)))))]
    (when-let [error (or batch-error candidate-error)]
      (throw error))))

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
