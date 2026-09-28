(ns metabase.pulse.task.send-pulses
  "Tasks related to running `Pulses`.

  `SendPulse` job will send a pulse to all channels that are scheduled to run at the same time.
  For example if you have an Alert that has scheduled to send to both slack and emails at 6am, this job will be triggered
  and send the pulse to both channels. "
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.task.send-pulses-trigger :as task.send-pulses-trigger]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log])
  (:import
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Job: SendPulse ----------------------------------------------------

(defn- send-pulse!
  [pulse-id channel-ids]
  (tracing/with-span :tasks "task.pulse.send" {:pulse/id            pulse-id
                                               :pulse/channel-count (count channel-ids)}
    (try
      (if-let [pulse (models.pulse/retrieve-notification pulse-id
                                                         :archived false
                                                         ;; alerts should all be migrated to notifications by now
                                                         :alert_condition nil)]
        (task-history/with-task-run (some-> (pulse.send/pulse->task-run-info pulse) (assoc :auto-complete false))
          (task-history/with-task-history {:task         "send-pulse"
                                           :task_details {:pulse-id    pulse-id
                                                          :channel-ids (seq channel-ids)}}
            (log/debugf "Starting Pulse Execution: %d" pulse-id)
            (pulse.send/send-pulse! pulse :channel-ids channel-ids :async? true)
            (log/debugf "Finished Pulse Execution: %d" pulse-id)
            :done))
        (log/debugf "Pulse %d not found, Skipping." pulse-id))
      (catch Throwable e
        (log/errorf "Error sending Pulse %d to channel ids: %s: %s" pulse-id (str/join ", " channel-ids) (ex-message e))))))

; Clearing pulse channels is not done synchronously in order to support undoing feature.
(defn- clear-pulse-channels-no-recipients!
  "Delete PulseChannels that have no recipients and no channel set for a pulse, returns the channel ids that were deleted."
  [pulse-id]
  (tracing/with-span :tasks "task.pulse.clear-orphan-channels" {:pulse/id pulse-id}
    (when-let [ids-to-delete (seq
                              (for [channel (pulse.db/pulse-channels-without-recipients pulse-id)
                                    :when  (case (:channel_type channel)
                                             :email
                                             (empty? (get-in channel [:details :emails]))
                                             :slack
                                             (empty? (get-in channel [:details :channel]))
                                             :http
                                             (nil? (:channel_id channel)))]
                                (:id channel)))]
      (log/infof "Deleting %d PulseChannels with id: %s due to having no recipients" (count ids-to-delete) (str/join ", " ids-to-delete))
      (pulse.db/delete-pulse-channels! ids-to-delete)
      (set ids-to-delete))))

(defn- send-pulse!*
  "Do several things:
  - Clear PulseChannels that have no recipients and no channel set for a pulse
  - Send a pulse to a list of channels"
  [pulse-id channel-ids]
  (let [cleared-channel-ids         (clear-pulse-channels-no-recipients! pulse-id)
        to-send-channel-ids         (set/difference channel-ids cleared-channel-ids)
        to-send-enabled-channel-ids (pulse.db/enabled-pulse-channel-ids to-send-channel-ids)]
    (if (seq to-send-enabled-channel-ids)
      (send-pulse! pulse-id to-send-enabled-channel-ids)
      (log/infof "Skip sending pulse %d because all channels have no recipients" pulse-id))))

(task/defjob ^{:doc "Triggers that send a pulse to a list of channels at a specific time"}
  SendPulse
  [context]
  (let [{:strs [pulse-id channel-ids]} (qc/from-job-data context)
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
      (log/infof "SendPulse fired for pulse %d (trigger=%s, scheduled=%s, actual=%s, recovering=%s, refire=%d, scheduler=%s)"
                 pulse-id trigger-key scheduled-fire-time fire-time recovering? refire-count scheduler-id)
      (send-pulse!* pulse-id channel-ids))))

(task/defjob
  ^{:doc
    "Find all notification subscriptions with cron schedules and create a trigger for each.
    Run once on startup.

    Context: Prior to 50, the SendPulse job has a single trigger that sends all pulses, but in #42316
    We've changed it to one trigger per PulseChannel. We need this job so that users migrate from < 50
    have all the triggers initiated properly.
    The fact that it runs on every startup is because we have no way to have it run only once.
    Ideally this should be a migration."
    DisallowConcurrentExecution true}
  InitSendPulseTriggers
  [_context]
  (log/info "Initializing SendPulse triggers for dashboard subscriptions")
  (task.send-pulses-trigger/init-dashboard-subscription-triggers!))

;;; -------------------------------------------------- Task init ------------------------------------------------

(defmethod task/init! ::SendPulses [_]
  (let [send-pulse-job (jobs/build
                        (jobs/with-identity task.send-pulses-trigger/send-pulse-job-key)
                        (jobs/with-description "Send Pulse")
                        (jobs/of-type SendPulse)
                        (jobs/store-durably))
        init-job       (jobs/build
                        (jobs/of-type InitSendPulseTriggers)
                        (jobs/with-identity (jobs/key "metabase.task.send-pulses.init-send-pulse-triggers.job"))
                        (jobs/store-durably))
        init-trigger   (triggers/build
                        ;; run once on startup
                        (triggers/with-identity (triggers/key "metabase.task.send-pulses.init-send-pulse-triggers.trigger"))
                        (triggers/start-now))]
    (task/add-job! send-pulse-job)
    (task/schedule-task! init-job init-trigger)))
