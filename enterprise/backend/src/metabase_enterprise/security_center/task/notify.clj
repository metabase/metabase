(ns metabase-enterprise.security-center.task.notify
  "Quartz task that sends repeat notifications for unacknowledged security
   advisories. Runs every 6 hours; cadence per advisory depends on severity:
     - critical: daily
     - high/medium/low: weekly"
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private severity->repeat-days
  "Number of days between repeat notifications, keyed by severity."
  {:critical 1
   :high     7
   :medium   7
   :low      7})

(defn- due-for-notification?
  "True if enough time has passed since `last_notified_at` for this advisory's
   severity cadence. Always true if never notified."
  [{:keys [severity last_notified_at]}]
  (if (nil? last_notified_at)
    true
    (let [days   (get severity->repeat-days severity 7)
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
  (let [advisories (unacknowledged-active-advisories)]
    (doseq [advisory advisories
            :when (due-for-notification? advisory)]
      (try
        (notification/notify-advisory! advisory)
        (catch Exception e
          (log/warnf e "Failed to send repeat notification for advisory %s"
                     (:advisory_id advisory)))))))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Send repeat notifications for unacknowledged security advisories"}
  SecurityAdvisoryNotify [_]
  (log/debug "Running security advisory repeat notification task")
  (send-repeat-notifications!))

(def ^:private job-key     "metabase.task.security-advisory-notify.job")
(def ^:private trigger-key "metabase.task.security-advisory-notify.trigger")

(defmethod task/init! ::SecurityAdvisoryNotify
  [_]
  (let [job      (jobs/build
                  (jobs/of-type SecurityAdvisoryNotify)
                  (jobs/with-identity (jobs/key job-key)))
        schedule (cron/cron-schedule "0 0 */6 * * ? *")
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/start-now)
                  (triggers/with-schedule schedule))]
    (task/schedule-task! job trigger)))
