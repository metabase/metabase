(ns metabase.notification.task.send
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.notification.db :as notification.db]
   [metabase.notification.send :as notification.send]
   [metabase.notification.task.send-trigger :as notification.task.send-trigger]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

(defn- send-notification*
  [subscription-id]
  (let [subscription    (notification.db/subscription subscription-id)
        notification-id (:notification_id subscription)
        notification    (notification.db/notification notification-id)]
    (log/with-context {:subscription-id subscription-id
                       :notification-id notification-id}
      (cond
        (:active notification)
        (tracing/with-span :tasks "task.notification.send" {:notification/subscription-id subscription-id
                                                            :notification/id              notification-id}
          (task-history/with-task-run (some-> (notification.send/notification->task-run-info notification) (assoc :auto-complete false))
            (try
              (log/info "Submitting to the notification queue")
              (task-history/with-task-history {:task         "notification-trigger"
                                               :task_details {:trigger_type                 :notification-subscription/cron
                                                              :notification_subscription_id subscription-id
                                                              :cron_schedule                (:cron_schedule subscription)
                                                              :notification_ids             [notification-id]}}
                (notification.send/send-notification! (assoc notification :triggering_subscription subscription)))
              (log/info "Submitted to the notification queue")
              (catch Exception e
                (log/errorf "Failed to submit to the notification queue: %s" (ex-message e))
                (throw e)))))

        (nil? notification)
        (do
          (log/warnf "Skipping and deleting trigger for subscription %d because it does not exist." subscription-id)
          (notification.task.send-trigger/delete-trigger-for-subscription! subscription-id))

        (not (:active notification))
        (do
          (log/warnf "Skipping and deleting trigger for subscription %d because the notification is deactivated" subscription-id)
          (notification.task.send-trigger/delete-trigger-for-subscription! subscription-id))))))

(task/defjob ^{:doc "Triggers that send a notification for a subscription."}
  SendNotification
  [context]
  (let [{:strs [subscription-id]} (qc/from-job-data context)
        ^JobExecutionContext ctx  context
        scheduled-fire-time       (.getScheduledFireTime ctx)
        fire-time                 (.getFireTime ctx)
        fire-instance-id          (.getFireInstanceId ctx)
        recovering?               (.isRecovering ctx)
        refire-count              (.getRefireCount ctx)
        trigger-key               (.. ctx getTrigger getKey getName)
        scheduler-id              (.. ctx getScheduler getSchedulerInstanceId)]
    (log/with-context {:quartz-fire-instance-id    fire-instance-id
                       :quartz-scheduled-fire-time (str scheduled-fire-time)
                       :quartz-fire-time           (str fire-time)
                       :quartz-recovering          recovering?
                       :quartz-refire-count        refire-count
                       :quartz-trigger-key         trigger-key
                       :quartz-scheduler-id        scheduler-id}
      (log/infof "SendNotification fired for subscription %d (trigger=%s, scheduled=%s, actual=%s, recovering=%s, refire=%d, scheduler=%s)"
                 subscription-id trigger-key scheduled-fire-time fire-time recovering? refire-count scheduler-id)
      (send-notification* subscription-id))))

(task/defjob
  ^{:doc
    "Find all notification subscriptions with cron schedules and create a trigger for each.
    Run once on startup.

    Context: We've migrated alerts from pulse to notifications, see the `v53.2024-12-12T08:05:00` migration.
    This job is needed to create triggers for all existing notification subscriptions after the migration.
    The fact that it runs on every startup is because we have no way to have it run only once.
    Ideally this should be a migration."
    DisallowConcurrentExecution true}
  InitNotificationTriggers
  [_context]
  (log/info "Initializing SendNotification triggers")
  (notification.task.send-trigger/init-send-notification-triggers!))

(defmethod task/init! ::SendNotifications [_]
  (let [send-notification-job              (jobs/build
                                            (jobs/with-identity notification.task.send-trigger/send-notification-job-key)
                                            (jobs/with-description "Send Notification")
                                            (jobs/of-type SendNotification)
                                            (jobs/store-durably))
        init-notification-triggers-job     (jobs/build
                                            (jobs/of-type InitNotificationTriggers)
                                            (jobs/with-identity (jobs/key "metabase.task.notification.init-notification-triggers.job"))
                                            (jobs/store-durably))
        init-notification-triggers-trigger (triggers/build
                                            (triggers/with-identity (triggers/key "metabase.task.notification.init-notification-triggers.trigger"))
                                            ;; run once on startup
                                            (triggers/start-now))]
    (task/add-job! send-notification-job)
    (task/schedule-task! init-notification-triggers-job init-notification-triggers-trigger)))
