(ns metabase.task.notification
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.models.task-history :as task-history]
   [metabase.notification.core :as notification]
   [metabase.pulse]
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

(defn- build-trigger
  "Build a Quartz Trigger for `database` and `task-info` if a schedule exists."
  ^CronTrigger [subscription-id cron-schedule]
  (triggers/build
   (triggers/with-description (format "Notification Subscription %d" subscription-id))
   (triggers/with-identity (send-notification-trigger-key subscription-id))
   (triggers/using-job-data {"subcription-id" subscription-id})
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
  (let [existing-trigger (first (task/existing-trigger send-notification-job-key (send-notification-trigger-key id)))]
    (cond
     ;; delete trigger if type changes
      (and
       (not= type :notification-subscription/cron)
       existing-trigger)
      (do
        (log/infof "Deleting trigger for subscription %d because of type changes" id)
        (task/delete-trigger! (-> existing-trigger :key triggers/key)))

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
  (when-first [trigger (task/existing-trigger send-notification-job-key (send-notification-trigger-key notification-subscription-id))]
    (log/infof "Deleting trigger for subscription %d" notification-subscription-id)
    (task/delete-trigger! (-> trigger :key triggers/key))))

(defn- send-notification*
  [subscription-id]
  (let [subscription    (t2/select-one :model/NotificationSubscription subscription-id)
        notification-id (:notification_id subscription)]
    (try
      (log/infof "Sending notification %d for subscription %d" notification-id subscription-id)
      (task-history/with-task-history {:task         "notification-trigger"
                                       :task_details {:trigger_type                :notification-subscription/cron
                                                      :notification_subcription_id subscription-id
                                                      :cron_schedule               (:cron_schedule subscription)
                                                      :notification_ids            [notification-id]}}
        (notification/*send-notification!* (t2/select-one :model/Notification notification-id)))
      (log/infof "Sent notification %d for subscription %d" notification-id subscription-id)
      (catch Exception e
        (log/errorf e "Failed to send notification %d for subscription %d" notification-id subscription-id)
        (throw e)))))

(jobs/defjob ^{:doc "Triggers that send a pulse to a list of channels at a specific time"}
  SendNotification
  [context]
  (let [{:strs [subcription-id]} (qc/from-job-data context)]
    (send-notification* subcription-id)))

(defmethod task/init! ::SendNotifications [_]
  (let [send-notification-job (jobs/build
                               (jobs/with-identity send-notification-job-key)
                               (jobs/with-description "Send Notification")
                               (jobs/of-type SendNotification)
                               (jobs/store-durably))]
    (task/add-job! send-notification-job)))
