(ns metabase-enterprise.security-center.task.sync-advisories
  "Quartz task that periodically fetches advisories from HM and re-evaluates
   matching queries against the appdb."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def job-key
  "Quartz job key for the sync-advisories task. Public so the API can trigger it on demand."
  "metabase.task.security-center.sync-advisories.job")
(def ^:private trigger-key "metabase.task.security-center.sync-advisories.trigger")

(defn sync-and-evaluate!
  "Fetch advisories and re-evaluate matching queries."
  []
  (when (premium-features/security-center-enabled?)
    (log/info "Syncing security advisories")
    (try
      (fetch/sync-advisories!)
      (catch Exception e
        (log/warn e "Error fetching advisories from HM")))
    (try
      (matching/evaluate-all-advisories!)
      (catch Exception e
        (log/warn e "Error re-evaluating advisories")))))

(task/defjob ^{:doc "Periodically fetch and re-evaluate security advisories."
               DisallowConcurrentExecution true} SyncAdvisories [_]
  (sync-and-evaluate!))

(defmethod task/init! ::SyncAdvisories [_]
  (when (premium-features/security-center-enabled?)
    (let [minute  (rand-int 60)
          ;; Run at a random minute past 0:00, 6:00, 12:00, 18:00 UTC
          cron-str (format "0 %d 0/6 * * ? *" minute)
          job     (jobs/build
                   (jobs/of-type SyncAdvisories)
                   (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key trigger-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (cron/schedule
                     (cron/cron-schedule cron-str)
                     (cron/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))
