(ns metabase-enterprise.security-center.task.sync-advisories
  "Quartz task that periodically fetches advisories from HM and re-evaluates
   matching queries against the appdb."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase.premium-features.token-check :as token-check]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.task.security-center.sync-advisories.job")
(def ^:private trigger-key "metabase.task.security-center.sync-advisories.trigger")

(defn- sync-and-evaluate! []
  (when (token-check/security-center-enabled?)
    (log/info "Syncing security advisories")
    (try
      (fetch/sync-advisories!)
      (catch Exception e
        (log/warnf e "Error fetching advisories from HM")))
    (try
      (matching/evaluate-all-advisories!)
      (catch Exception e
        (log/warnf e "Error re-evaluating advisories")))))

(task/defjob ^{DisallowConcurrentExecution true} SyncAdvisories [_]
  (sync-and-evaluate!))

(defmethod task/init! ::SyncAdvisories [_]
  (when (token-check/security-center-enabled?)
    (let [job     (jobs/build
                   (jobs/of-type SyncAdvisories)
                   (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key trigger-key))
                   (triggers/with-schedule
                    (simple/schedule
                     (simple/with-interval-in-hours 6)
                     (simple/repeat-forever)
                     (simple/ignore-misfires))))]
      (task/schedule-task! job trigger))))
