(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`.

  `SendPulse` job will send a pulse to all channels that are scheduled to run at the same time.
  For example if you have an Alert that has scheduled to send to both slack and emails at 6am, this job will be triggered
  and send the pulse to both channels. "
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.models.pulse :as pulse]
   [metabase.models.task-history :as task-history]
   [metabase.pulse]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task :as task]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Job: SendPulse ----------------------------------------------------

(def ^:private send-pulse-job-key (jobs/key "metabase.task.send-pulses.send-pulse.job"))

(defn- send-pulse-trigger-key
  [pulse-id schedule-map]
  (triggers/key (format "metabase.task.send-pulse.trigger.%d.%s"
                        pulse-id (-> schedule-map
                                     u.cron/schedule-map->cron-string
                                     (str/replace " " "_")))))

(defn- send-pulse-trigger-key->info
  [trigger-key]
  (let [[_ pulse-id schedule-str] (re-matches #"metabase\.task\.send-pulse\.trigger\.(\d+)\.(.*)" trigger-key)]
    {:pulse-id     (parse-long pulse-id)
     :schedule-map (-> schedule-str
                       (str/replace "_" " ")
                       u.cron/cron-string->schedule-map)}))

(defn- send-pulse!
  [pulse-id channel-ids]
  (try
    (task-history/with-task-history {:task         "send-pulse"
                                     :task_details {:pulse-id    pulse-id
                                                    :channel-ids (seq channel-ids)}}
      (when-let [pulse (pulse/retrieve-notification pulse-id :archived false)]
        (log/debugf "Starting Pulse Execution: %d" pulse-id)
        (metabase.pulse/send-pulse! pulse :channel-ids channel-ids)
        (log/debugf "Finished Pulse Execution: %d" pulse-id)
        :done))
    (catch Throwable e
      (log/errorf e "Error sending Pulse %d to channel ids: %s" pulse-id (str/join ", " channel-ids)))))

(defn- send-trigger-timezone
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(mu/defn ^:private send-pulse-trigger
  "Build a Quartz trigger to send a pulse to a list of channel-ids."
  ^CronTrigger
  ([pulse-id     :- pos-int?
    schedule-map :- u.cron/ScheduleMap
    pc-ids       :- [:set pos-int?]
    timezone     :- :string]
   (send-pulse-trigger pulse-id schedule-map pc-ids timezone 6))
 ([pulse-id     :- pos-int?
   schedule-map :- u.cron/ScheduleMap
   pc-ids       :- [:set pos-int?]
   timezone     :- :string
   priority     :- pos-int?]
  (triggers/build
   (triggers/with-identity (send-pulse-trigger-key pulse-id schedule-map))
   (triggers/for-job send-pulse-job-key)
   (triggers/using-job-data {"pulse-id"    pulse-id
                             "channel-ids" pc-ids})
   (triggers/with-schedule
     (cron/schedule
      (cron/cron-schedule (u.cron/schedule-map->cron-string schedule-map))
      (cron/in-time-zone (TimeZone/getTimeZone ^String timezone))
      ;; if we miss a sync for one reason or another (such as system being down) do not try to run the sync again.
      ;; Just wait until the next sync cycle.
      ;;
      ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html for more info
      (cron/with-misfire-handling-instruction-fire-and-proceed)))
   (triggers/with-priority priority))))

; Clearing pulse channels is not done synchronously in order to support undoing feature.
(defn- clear-pulse-channels-no-recipients!
  "Delete PulseChannels that have no recipients and no channel set for a pulse, returns the channel ids that were deleted."
  [pulse-id]
  (when-let [ids-to-delete (seq
                            (for [channel (t2/select [:model/PulseChannel :id :details]
                                                     :pulse_id pulse-id
                                                     :id [:not-in {:select   [[:pulse_channel_id :id]]
                                                                   :from     :pulse_channel_recipient
                                                                   :group-by [:pulse_channel_id]
                                                                   :having   [:>= :%count.* [:raw 1]]}])
                                  :when (and (empty? (get-in channel [:details :emails]))
                                             (not (get-in channel [:details :channel])))]
                              (:id channel)))]
    (log/infof "Deleting %d PulseChannels with id: %s due to having no recipients" (count ids-to-delete) (str/join ", " ids-to-delete))
    (t2/delete! :model/PulseChannel :id [:in ids-to-delete])
    (set ids-to-delete)))

(defn- send-pulse!*
  "Do several things:
  - Clear PulseChannels that have no recipients and no channel set for a pulse
  - Send a pulse to a list of channels"
  [pulse-id channel-ids]
  (let [cleared-channel-ids         (clear-pulse-channels-no-recipients! pulse-id)
        to-send-channel-ids         (set/difference channel-ids cleared-channel-ids)
        to-send-enabled-channel-ids (t2/select-pks-set :model/PulseChannel :id [:in to-send-channel-ids] :enabled true)]
    (if (seq to-send-enabled-channel-ids)
      (send-pulse! pulse-id to-send-enabled-channel-ids)
      (log/infof "Skip sending pulse %d because all channels have no recipients" pulse-id))))

;; called in [driver/report-timezone] setter
(defn update-send-pulse-triggers-timezone!
  "Update the timezone of all SendPulse triggers if the report timezone changes."
  []
  (let [triggers     (-> send-pulse-job-key task/job-info :triggers)
        new-timezone (send-trigger-timezone)]
    (doseq [trigger triggers
            :when (not= new-timezone (:timezone trigger))] ; skip if timezone is the same
      (let [trigger-key            (:key trigger)
            channel-ids            (get-in trigger [:data "channel-ids"])
            {:keys [pulse-id
                    schedule-map]} (send-pulse-trigger-key->info trigger-key)]
        (log/infof "Updating timezone of trigger %s to %s. Was: %s" trigger-key new-timezone (:timezone trigger))
        (task/reschedule-trigger! (send-pulse-trigger pulse-id schedule-map channel-ids new-timezone (:priority trigger)))))))

(jobs/defjob ^{:doc "Triggers that send a pulse to a list of channels at a specific time"}
  SendPulse
  [context]
  (let [{:strs [pulse-id channel-ids]} (qc/from-job-data context)]
    (send-pulse!* pulse-id channel-ids)))

;;; ------------------------------------------------ Job: InitSendPulseTriggers ----------------------------------------------------

(declare update-send-pulse-trigger-if-needed!)

(defn init-send-pulse-triggers!
  "Update send pulse triggers for all active pulses.
  Called once when Metabase starts up to create triggers for all existing PulseChannels
  and whenever the report timezone changes."
  []
  (let [trigger-slot->pc-ids (as-> (t2/select :model/PulseChannel
                                              {:select    [:pc.*]
                                               :from      [[:pulse_channel :pc]]
                                               :left-join [[:pulse :p] [:= :pc.pulse_id :p.id]
                                                           [:report_dashboard :d] [:= :p.dashboard_id :d.id]]
                                               :where     [:and
                                                           [:= :pc.enabled true]
                                                           [:or
                                                            ;; alerts
                                                            [:= :p.dashboard_id nil]
                                                            ;; if dashboard subscriptions, make sure it's not archived
                                                            [:= :d.archived false]]]})
                                   results
                               (group-by #(select-keys % [:pulse_id :schedule_type :schedule_day :schedule_hour :schedule_frame]) results)
                               (update-vals results #(map :id %)))]
    (doseq [[{:keys [pulse_id] :as schedule-map} pc-ids] trigger-slot->pc-ids]
      (update-send-pulse-trigger-if-needed! pulse_id schedule-map :add-pc-ids (set pc-ids)))))

(jobs/defjob
  ^{:doc
    "Find all active pulse Channels, group them by pulse-id and schedule time and create a trigger for each.

    This is basically a migraiton in disguise to move from the old SendPulses job to the new SendPulse job.

    Context: prior to this, SendPulses is a single job that runs hourly and send all Pulses that are scheduled for that
    hour.
    Since that's inefficient and we want to be able to send pulses in parallel, we changed it so that each PulseChannel
    of the same schedule will have its own SendPulse trigger.
    During this transition, we need to schedule all the SendPulse triggers for existing PulseChannels, so we have this job
    that run once on Metabase startup to do that."}
  InitSendPulseTriggers
  [_context]
  (init-send-pulse-triggers!))

;;; --------------------------------------------- Helpers -------------------------------------------

;; called by PulseChannel hooks
(defn update-send-pulse-trigger-if-needed!
  "Update send pulse trigger of a pulse for a specific schedule map with new pulse channel ids.

  Send Pulse triggers are grouped by pulse id and schedule time, meaning PulseChannels of a Pulse that scheduled
  to run at the same time of will be send together.
  This function will updates the corresponding trigger if PulseChannels changes.

  * To add 2 pulse channels to a trigger
    (update-send-pulse-trigger-if-needed! pulse-id schedule-map :add-pc-ids #{1 2}))

  * To remove 2 pulse channels from a trigger
    (update-send-pulse-trigger-if-needed! pulse-id schedule-map :remove-pc-ids #{1 2}))"
  [pulse-id schedule-map & {:keys [add-pc-ids remove-pc-ids]}]
  (let [schedule-map     (update-vals schedule-map
                                      #(if (keyword? %)
                                         (name %)
                                         %))
        trigger-key      (send-pulse-trigger-key pulse-id schedule-map)
        ;; there should be at most one existing trigger
        existing-trigger (->> (-> send-pulse-job-key task/job-info :triggers)
                              (filter #(= (:key %) (.getName ^TriggerKey trigger-key)))
                              first)
        existing-pc-ids (some-> existing-trigger :data (get "channel-ids") set)
        new-pc-ids      (if (some? existing-pc-ids)
                          (cond-> existing-pc-ids
                            (some? add-pc-ids)    (set/union existing-pc-ids (set add-pc-ids))
                            (some? remove-pc-ids) (set/difference (set remove-pc-ids)))
                          (set add-pc-ids))]
    (cond
     ;; no op when new-pc-ids doesnt't change
     (= new-pc-ids existing-pc-ids) nil

     ;; delete if no new pc-ids and there is an existing trigger
     (and (empty? new-pc-ids)
          (some? existing-pc-ids))
     (do
      (log/infof "Deleting trigger %s for pulse %d" trigger-key pulse-id)
      (task/delete-trigger! trigger-key))

     ;; delete then create if pc ids changes
     (and (seq new-pc-ids)
          (not= new-pc-ids existing-pc-ids))
     (do
      (log/infof "Updating Send Pulse trigger %s for pulse %d with new pc-ids: %s, was: %s " trigger-key pulse-id new-pc-ids existing-pc-ids)
      (task/delete-trigger! trigger-key)
      (task/add-trigger! (send-pulse-trigger pulse-id schedule-map new-pc-ids (send-trigger-timezone)))))))

;;; -------------------------------------------------- Task init ------------------------------------------------

(defmethod task/init! ::SendPulses [_]
  (let [send-pulse-job (jobs/build
                        (jobs/with-identity send-pulse-job-key)
                        (jobs/with-description "Send Pulse")
                        (jobs/of-type SendPulse)
                        (jobs/store-durably))
        init-job       (jobs/build
                        (jobs/of-type InitSendPulseTriggers)
                        (jobs/with-identity (jobs/key "metabase.task.send-pulses.init-send-pulse-triggers.job"))
                        (jobs/store-durably))
        init-trigger   (triggers/build
                        (triggers/with-identity (triggers/key "metabase.task.send-pulses.init-send-pulse-triggers.trigger"))
                        ;; run only once per MB instance (like a migration)
                        (triggers/start-now))]
    (task/add-job! send-pulse-job)
    (task/schedule-task! init-job init-trigger)))
