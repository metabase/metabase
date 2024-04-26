(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`.

  There are 2 main jobs here:

  1. `SendPulse` - in which it'll send a pulse to all channels that are scheduled to run at the same time.
    For example if you have an Alert that has scheduled to send to both slack and emails at 6am, this job will be triggered
    and send the pulse to both channels.

  2. `RePrioritizeSendPulses` - is the coordinator job that has 2 responsibilities:
    - Update the priority of SendPulse jobs that are scheduled at the same time so that fast pulses are executed first.
    - Delete PulseChannels that don't have any recipients."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.pulse :as pulse]
   [metabase.models.task-history :as task-history]
   [metabase.pulse]
   [metabase.task :as task]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (org.quartz
    CronTrigger)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Job: SendPulse ----------------------------------------------------

(def ^:private send-pulse-job-key (jobs/key "metabase.task.send-pulses.send-pulse.job"))

(defn- send-pulse-trigger-key
  [pulse-id schedule-map]
  (triggers/key (format "metabase.task.send-pulse.trigger.%d.%s"
                        pulse-id (-> schedule-map
                                     u.cron/schedule-map->cron-string
                                     (str/replace " " "_")))))

(defn- send-pulse!
  [pulse-id channel-ids]
  (try
    (task-history/with-task-history {:task         "send-pulse"
                                     :task_details {:pulse-id pulse-id}}
      (log/debugf "Starting Pulse Execution: %d" pulse-id)
      (when-let [pulse (pulse/retrieve-notification pulse-id :archived false)]
        (metabase.pulse/send-pulse! pulse :channel-ids channel-ids))
      (log/debugf "Finished Pulse Execution: %d" pulse-id))
    (catch Throwable e
      (log/errorf e "Error sending Pulse %d to channel ids: %s" pulse-id (str/join ", " channel-ids)))))

(mu/defn ^:private send-pulse-trigger
  "Build a Quartz trigger to send a pulse to a list of channel-ids."
  ^CronTrigger
  [pulse-id     :- pos-int?
   schedule-map :- map?
   pc-ids       :- [:maybe [:set pos-int?]]]
  (when (seq pc-ids)
    (triggers/build
     (triggers/with-identity (send-pulse-trigger-key pulse-id schedule-map))
     (triggers/for-job send-pulse-job-key)
     (triggers/using-job-data {"pulse-id"    pulse-id
                               "channel-ids" (set pc-ids)})
     (triggers/with-schedule
       (cron/schedule
        (cron/cron-schedule (u.cron/schedule-map->cron-string schedule-map))
        ;; if we miss a sync for one reason or another (such as system being down) do not try to run the sync again.
        ;; Just wait until the next sync cycle.
        ;;
        ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html for more info
        (cron/with-misfire-handling-instruction-ignore-misfires))))))

(jobs/defjob ^{:doc "Triggers that send a pulse to a list of channels at a specific time"}
  SendPulse
  [{:keys [pulse-id channel-ids]}]
  (send-pulse! pulse-id channel-ids))

;;; --------------------------------------------- Job: RePrioritizeSendPulses -------------------------------------------

(def ^:private reprioritize-send-pulse-job-key (jobs/key "metabase.task.send-pulses.reprioritize.job"))

(def ^:private reprioritize-send-pulse-trigger-key (triggers/key "metabase.task.send-pulses.reprioritize.trigger"))

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
        task-schedule    (u.cron/schedule-map->cron-string schedule-map)
        ;; there should be one existing trigger
        existing-trigger (some #(when (and (= (:key %) (.getName trigger-key))
                                           (= (:schedule %) task-schedule))
                                  %)
                               (-> send-pulse-job-key task/job-info :triggers))
        existing-pc-ids (some-> existing-trigger :data (get "channel-ids") set)
        new-pc-ids      (if (some? existing-pc-ids)
                          (cond
                           (some? add-pc-ids)    (set/union existing-pc-ids (set add-pc-ids))
                           (some? remove-pc-ids) (apply disj existing-pc-ids (set remove-pc-ids)))
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
      (task/add-trigger! (send-pulse-trigger pulse-id schedule-map new-pc-ids))))))

(defn- clear-pulse-channels!
  []
  (when-let [ids-to-delete (seq
                            (for [channel (t2/select [:model/PulseChannel :id :details]
                                                     :id [:not-in {:select   [[:pulse_channel_id :id]]
                                                                   :from     :pulse_channel_recipient
                                                                   :group-by [:pulse_channel_id]
                                                                   :having   [:>= :%count.* [:raw 1]]}])]
                              (when (and (empty? (get-in channel [:details :emails]))
                                         (not (get-in channel [:details :channel])))
                                (:id channel))))]
    (log/infof "Deleting %d PulseChannels with id: %s due to having no recipients" (count ids-to-delete) (str/join ", " ids-to-delete))
    (t2/delete! :model/PulseChannel :id [:in ids-to-delete])))

(defn- reprioritize-send-pulses!
  "Find all active pulse Channels, group them by pulse-id and schedule time and create a trigger for each.

  Also remove PulseChannels that don't have any recipients."
  []
  (log/info "Reprioritizing send pulses")
  (clear-pulse-channels!)
  (let [trigger-slot->pc-ids (as-> (t2/select :model/PulseChannel :enabled true) results
                               (group-by #(select-keys % [:pulse_id :schedule_type :schedule_day :schedule_hour :schedule_frame]) results)
                               (update-vals results #(map :id %)))]
    ;; TODO: use info from task-history to set priority of each pulses of the same time slot
    (doseq [[{:keys [pulse_id] :as schedule-map} pc-ids] trigger-slot->pc-ids]
      (update-send-pulse-trigger-if-needed! pulse_id schedule-map :add-pc-ids (set pc-ids)))))

(jobs/defjob ^{:doc "Reprioritizes SendPulse jobs based on the PulseChannels that are scheduled to run at the same time."}
  RePrioritizeSendPulses
  [_job-context]
  (reprioritize-send-pulses!))

;;; -------------------------------------------------- Task init ------------------------------------------------

(defmethod task/init! ::SendPulses [_]
  (let [send-pulse-job       (jobs/build
                              (jobs/with-identity send-pulse-job-key)
                              (jobs/with-description "Send Pulse")
                              (jobs/of-type SendPulse)
                              (jobs/store-durably))
        re-proritize-job     (jobs/build
                              (jobs/with-identity reprioritize-send-pulse-job-key)
                              (jobs/with-description  "Update SendPulses Pjiority")
                              (jobs/of-type RePrioritizeSendPulses)
                              (jobs/store-durably))
        re-proritize-trigger (triggers/build
                              (triggers/with-identity reprioritize-send-pulse-trigger-key)
                              (triggers/for-job reprioritize-send-pulse-job-key)
                              (triggers/start-now)
                              (triggers/with-schedule
                                (cron/schedule
                                 (cron/cron-schedule "0 0 1 ? * 7 *") ; at 1am on Saturday every week
                                 (cron/with-misfire-handling-instruction-ignore-misfires))))]
    (task/add-job! send-pulse-job)
    (task/add-job! re-proritize-job)
    (task/schedule-task! re-proritize-job re-proritize-trigger)
    ;; this function is idempotence, so we can call it multiple times
    (reprioritize-send-pulses!)))
