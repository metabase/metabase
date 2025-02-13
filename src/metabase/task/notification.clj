(ns metabase.task.notification
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.models.task-history :as task-history]
   [metabase.notification.core :as notification]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(def ^:private send-notification-job-key (jobs/key "metabase.task.notification.send.job"))

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

(defn update-subscription-trigger!
  "Update the trigger for a notification subscription if it exists and needs to be updated."
  [{:keys [id type cron_schedule] :as _notification-subscription}]
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
        (task/add-trigger! (build-trigger id cron_schedule)))

      (not= cron_schedule (:schedule existing-trigger))
      (do
        (log/infof "Rescheduling trigger for subscription %d from %s to %s" id (:schedule existing-trigger) cron_schedule)
        (task/delete-trigger! (-> existing-trigger :key triggers/key))
        (task/add-trigger! (build-trigger id cron_schedule)))

      :else
      (log/infof "No changes to trigger for subscription %d" id))))

(defn delete-trigger-for-subscription!
  "Delete the trigger for a notification subscription."
  [notification-subscription-id]
  (when-first [trigger (task/existing-triggers send-notification-job-key (send-notification-trigger-key notification-subscription-id))]
    (log/infof "Deleting trigger for subscription %d" notification-subscription-id)
    (task/delete-trigger! (-> trigger :key triggers/key))))

(defn- send-notification*
  [subscription-id]
  (let [subscription    (t2/select-one :model/NotificationSubscription subscription-id)
        notification-id (:notification_id subscription)
        notification (t2/select-one :model/Notification notification-id)]
    (cond
      (:active notification)
      (try
        (log/infof "Sending notification %d for subscription %d" notification-id subscription-id)
        (task-history/with-task-history {:task         "notification-trigger"
                                         :task_details {:trigger_type                 :notification-subscription/cron
                                                        :notification_subscription_id subscription-id
                                                        :cron_schedule                (:cron_schedule subscription)
                                                        :notification_ids             [notification-id]}}
          (notification/send-notification! notification :notification/sync? true))
        (log/infof "Sent notification %d for subscription %d" notification-id subscription-id)
        (catch Exception e
          (log/errorf e "Failed to send notification %d for subscription %d" notification-id subscription-id)
          (throw e)))

      (nil? notification)
      (do
        (log/warnf "Skipping and deleting trigger for subscription %d because it does not exist." subscription-id)
        (delete-trigger-for-subscription! subscription-id))
      (not (:active notification))
      (do
        (log/warnf "Skipping and deleting trigger for subscription %d because the notification is deactivated" subscription-id)
        (delete-trigger-for-subscription! subscription-id)))))

;; called in [driver/report-timezone] setter
(defn update-send-notification-triggers-timezone!
  "Update the timezone of all SendPulse triggers if the report timezone changes."
  []
  (let [triggers     (-> send-notification-job-key task/job-info :triggers)
        new-timezone (send-notification-timezone)
        subscription-id->cron (t2/select-fn->fn :id :cron_schedule :model/NotificationSubscription :type :notification-subscription/cron)]
    (doseq [trigger triggers
            :when (not= new-timezone (:timezone trigger))] ; skip if timezone is the same
      (let [trigger-key     (:key trigger)
            subscription-id (send-notification-trigger-key->subscription-id trigger-key)]
        (log/infof "Updating timezone of trigger %s to %s. Was: %s" trigger-key new-timezone (:timezone trigger))
        (task/reschedule-trigger! (build-trigger subscription-id (get subscription-id->cron subscription-id)))))))

(jobs/defjob ^{:doc "Triggers that send a notification for a subscription."}
  SendNotification
  [context]
  (let [{:strs [subscription-id]} (qc/from-job-data context)]
    (send-notification* subscription-id)))

(jobs/defjob
  ^{:doc
    "Find all notification subscriptions with cron schedules and create a trigger for each.

    Context: We've migrated alerts from pulse to notifications, see the `v53.2024-12-12T08:05:00` migration.
    This job is needed to create triggers for all existing notification subscriptions.
    Will only run once when Metabase starts up."}
  InitNotificationTriggers
  [_context]
  (run! update-subscription-trigger! (t2/reducible-select :model/NotificationSubscription)))

(defmethod task/init! ::SendNotifications [_]
  (let [send-notification-job              (jobs/build
                                            (jobs/with-identity send-notification-job-key)
                                            (jobs/with-description "Send Notification")
                                            (jobs/of-type SendNotification)
                                            (jobs/store-durably))
        init-notification-triggers-job     (jobs/build
                                            (jobs/of-type InitNotificationTriggers)
                                            (jobs/with-identity (jobs/key "metabase.task.notification.init-notification-triggers.job"))
                                            (jobs/store-durably))
        init-notification-triggers-trigger (triggers/build
                                            (triggers/with-identity (triggers/key "metabase.task.notification.init-notification-triggers.trigger"))
                                            ;; run only once per MB instance (like a migration)
                                            (triggers/start-now))]
    (task/add-job! send-notification-job)
    (task/schedule-task! init-notification-triggers-job init-notification-triggers-trigger)))
