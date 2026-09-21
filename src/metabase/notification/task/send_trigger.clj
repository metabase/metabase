(ns metabase.notification.task.send-trigger
  "Quartz trigger lifecycle for notification subscriptions.

  Separate from [[metabase.notification.task.send]] so that Notification model hooks can (un)schedule triggers: the job
  body over there loads the sending machinery, which reads the models."
  (:require
   [clojure.data :refer [diff]]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.notification.db :as notification.db]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(def send-notification-job-key
  "Key of the Quartz job that sends a notification when a subscription's trigger fires."
  (jobs/key "metabase.task.notification.send.job"))

(defn- send-notification-timezone
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(defn- send-notification-trigger-key
  ^TriggerKey [subscription-id]
  (triggers/key (format "metabase.task.notification.trigger.subscription.%d"
                        subscription-id)))

(defn- send-notification-trigger-key->subscription-id
  [trigger-key]
  (when-let [[_ m] (re-matches #"metabase\.task\.notification\.trigger\.subscription\.(\d+)" (str trigger-key))]
    (parse-long m)))

(defn- build-trigger
  "Build a Quartz Trigger for `database` and `task-info` if a schedule exists."
  ^CronTrigger [subscription-id cron-schedule]
  (triggers/build
   (triggers/with-description (format "Notification Subscription %d" subscription-id))
   (triggers/with-identity (send-notification-trigger-key subscription-id))
   (triggers/using-job-data {"subscription-id" subscription-id})
   (triggers/for-job send-notification-job-key)
   (triggers/start-now)
   (triggers/with-schedule
    (cron/schedule
     (cron/cron-schedule cron-schedule)
     (cron/in-time-zone (TimeZone/getTimeZone ^String (send-notification-timezone)))
     ;; We want to fire the trigger once even if the previous triggers  missed
     (cron/with-misfire-handling-instruction-fire-and-proceed)))
   ;; higher than sync
   (triggers/with-priority 6)))

(defn- create-new-trigger!
  [{:keys [id cron_schedule] :as _notification-subscription}]
  (task/add-trigger! (build-trigger id cron_schedule)))

(defn update-subscription-trigger!
  "Update the trigger for a notification subscription if it exists and needs to be updated."
  [{:keys [id type cron_schedule] :as notification-subscription}]
  (let [existing-trigger (first (task/existing-triggers send-notification-job-key (send-notification-trigger-key id)))]
    (cond
      ;; delete trigger if type changes
      (and
       (not= type :notification-subscription/cron)
       existing-trigger)
      (do
        (log/infof "Deleting trigger for subscription %d because of type changes" id)
        (task/delete-trigger! (-> existing-trigger :key triggers/key)))

      ;; do nothing if type is not cron
      (not= type :notification-subscription/cron)
      nil

      ;; create new if there is no existing trigger
      (not existing-trigger)
      (do
        (log/infof "Creating new trigger for subscription %d with schedule %s" id cron_schedule)
        (create-new-trigger! notification-subscription))

      (not= cron_schedule (:schedule existing-trigger))
      (do
        (log/infof "Rescheduling trigger for subscription %d from %s to %s" id (:schedule existing-trigger) cron_schedule)
        (task/delete-trigger! (-> existing-trigger :key triggers/key))
        (create-new-trigger! notification-subscription))

      :else
      (log/infof "No changes to trigger for subscription %d" id))))

(defn delete-trigger-for-subscription!
  "Delete the trigger for a notification subscription."
  [notification-subscription-id]
  (when-first [trigger (task/existing-triggers send-notification-job-key (send-notification-trigger-key notification-subscription-id))]
    (log/infof "Deleting trigger for subscription %d" notification-subscription-id)
    (task/delete-trigger! (-> trigger :key triggers/key))))

(defn- active-cron-subscription-id->subscription
  []
  (notification.db/active-cron-subscriptions-by-id))

(defn update-send-notification-triggers-timezone!
  "Update the timezone of all SendNotification triggers if the report timezone changes."
  []
  (let [triggers              (-> send-notification-job-key task/job-info :triggers)
        new-timezone          (send-notification-timezone)
        subscription-id->cron (update-vals (active-cron-subscription-id->subscription) :cron_schedule)]
    (doseq [trigger triggers
            :when (not= new-timezone (:timezone trigger))] ; skip if timezone is the same
      (let [trigger-key     (:key trigger)
            subscription-id (send-notification-trigger-key->subscription-id trigger-key)]
        (log/infof "Updating timezone of trigger %s to %s. Was: %s" trigger-key new-timezone (:timezone trigger))
        (task/reschedule-trigger! (build-trigger subscription-id (get subscription-id->cron subscription-id)))))))

(defn init-send-notification-triggers!
  "Initialize all notification subscription triggers.

  Called when starting the instance."
  []
  (assert (task/scheduler) "Scheduler must be started before initializing SendNotification triggers")

  ;; Get all existing triggers and subscription IDs
  (let [existing-triggers                  (:triggers (task/job-info send-notification-job-key))
        existing-triggers-subscription-ids (map #(get-in % [:data "subscription-id"]) existing-triggers)
        subscription-id->subscription      (active-cron-subscription-id->subscription)
        db-subscription-ids                (keys subscription-id->subscription)
        [to-delete to-create _to-skip]     (diff (set existing-triggers-subscription-ids) (set db-subscription-ids))]
    (doseq [subscription-id to-delete]
      (delete-trigger-for-subscription! subscription-id))
    (doseq [subscription-id to-create]
      (create-new-trigger! (get subscription-id->subscription subscription-id)))))
