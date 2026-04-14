(ns metabase-enterprise.security-center.task.sync-advisories
  "Quartz task that periodically fetches advisories from HM, re-evaluates
   matching queries against the appdb, and sends repeat notifications for
   unacknowledged active/error advisories."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.task.security-center.sync-advisories.job")
(def ^:private trigger-key "metabase.task.security-center.sync-advisories.trigger")

;;; ----------------------------------------- Repeat notifications --------------------------------------------------

(defn- due-for-notification?
  "True if enough time has passed since `last_notified_at` for this advisory's
   severity cadence. Always true if never notified."
  [{:keys [severity last_notified_at]}]
  (if (nil? last_notified_at)
    true
    (let [days   (settings/repeat-days-for-severity severity)
          cutoff (t/minus (t/offset-date-time) (t/days days))]
      (t/before? (t/offset-date-time last_notified_at) cutoff))))

(defn- unacknowledged-active-advisories
  "Return all unacknowledged advisories with match_status in (:active :error)."
  []
  (t2/select :model/SecurityAdvisory
             :acknowledged_at nil
             :match_status [:in ["active" "error"]]))

(defn send-repeat-notifications!
  "Check all unacknowledged active/error advisories and send repeat notifications
   for those that are due based on their severity cadence."
  []
  (doseq [advisory (unacknowledged-active-advisories)
          :when (due-for-notification? advisory)]
    (try
      (notification/notify-advisory! advisory)
      (catch Exception e
        (log/warnf e "Failed to send repeat notification for advisory %s"
                   (:advisory_id advisory))))))

;;; ----------------------------------------- Sync + evaluate + notify -----------------------------------------------

(defn sync-and-evaluate!
  "Fetch advisories, re-evaluate all, and send repeat notifications."
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
        (log/warn e "Error re-evaluating advisories")))
    (try
      (send-repeat-notifications!)
      (catch Exception e
        (log/warn e "Error sending repeat notifications")))
    (settings/security-center-last-synced-at! (t/offset-date-time))))

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
      (task/schedule-task! job trigger)
      ;; on first run of the feature, we sync immediately to seed advisories
      (when-not (settings/security-center-last-synced-at)
        (task/trigger-now! (jobs/key job-key))))))
