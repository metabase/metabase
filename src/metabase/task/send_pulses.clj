(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
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

;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------

; Clearing pulse channels is not done synchronously in order to support undoing feature.
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
    (t2/delete! :model/PulseChannel :id [:in ids-to-delete])))

;;; ------------------------------------------------------ Task ------------------------------------------------------

(def ^:private send-pulse-job-key              (jobs/key "metabase.task.send-pulses.send-pulse.job"))
(def ^:private reprioritize-send-pulse-job-key (jobs/key "metabase.task.send-pulses.reprioritize.job"))

(defn- send-pulse-trigger-key
  [pulse-id schedule-map]
  (triggers/key (format "metabase.task.send-pulse.trigger.%d.%s"
                        pulse-id (-> schedule-map
                                     u.cron/schedule-map->cron-string
                                     (str/replace " " "_")))))

(mu/defn ^:private send-pulse-trigger
  "Build a Quartz trigger to send a pulse."
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

(defn update-trigger-if-needed!
  "Replace or remove the existing trigger if the schedule changes."
  [pulse-id schedule-map & {:keys [add-pc-ids remove-pc-ids]}]
  (let [schedule-map     (update-vals schedule-map
                                      #(if (keyword? %)
                                         (name %)
                                         %))
        job              (task/job-info send-pulse-job-key)
        trigger-key      (send-pulse-trigger-key pulse-id schedule-map)
        task-schedule    (u.cron/schedule-map->cron-string schedule-map)
        ;; there should be one existing trigger
        existing-trigger (some #(when (and (= (:key %) (.getName trigger-key))
                                           (= (:schedule %) task-schedule))
                                  %)
                               (:triggers job))]
    (if (some? existing-trigger)
      (let [existing-pc-ids (-> existing-trigger :data (get "channel-ids") set)
            new-pc-ids      (cond
                             (some? add-pc-ids)    (set/union existing-pc-ids add-pc-ids)
                             (some? remove-pc-ids) (apply disj existing-pc-ids remove-pc-ids))]
        (log/infof "Existing pc-ids: %s, new pc-ids: %s, removed: %s, added: %s" existing-pc-ids new-pc-ids remove-pc-ids add-pc-ids)
        (task/delete-trigger! trigger-key)
        (when-let [new-trigger (send-pulse-trigger pulse-id schedule-map new-pc-ids)]
          (task/add-trigger! new-trigger)))
      (when-let [new-trigger (send-pulse-trigger pulse-id schedule-map (set add-pc-ids))]
        (log/infof "Creating a new trigger for pulse %d with pc-ids: %s" pulse-id add-pc-ids)
        (task/add-trigger! new-trigger)))))

(defn- send-pulse!
  [pulse-id channel-ids]
  (try
    (task-history/with-task-history {:task         "send-pulse"
                                     :task_details {:pulse-id pulse-id}}
      (log/debugf "Starting Pulse Execution: %d" pulse-id)
      (when-let [pulse (pulse/retrieve-notification pulse-id :archived false)]
        (metabase.pulse/send-pulse! pulse :channel-ids channel-ids))
      ;; TODO: clean up here too
      (log/debugf "Finished Pulse Execution: %d" pulse-id))
    (catch Throwable e
      (log/errorf e "Error sending Pulse %d to channel ids: %s" pulse-id (str/join ", " channel-ids)))))

(jobs/defjob ^{:doc "Triggers the sending of all pulses which are scheduled to run in the current hour"}
  SendPulse
  [{:keys [pulse-id channel-ids]}]
  (send-pulse! pulse-id channel-ids))

(defn- reprioritize-send-pulses
  []
  (let [pulse-channel-slots (as-> (t2/select :model/PulseChannel :enabled true) results
                              (group-by #(select-keys % [:pulse_id :schedule_type :schedule_day :schedule_hour :schedule_frame]) results)
                              (update-vals results #(map :id %)))]
    (for [[{:keys [pulse_id] :as schedule-map} pc-ids] pulse-channel-slots]
      (update-trigger-if-needed! pulse_id schedule-map :add-pc-ids (set pc-ids)))
    (clear-pulse-channels!)))

(jobs/defjob ^{:doc "Triggers the sending of all pulses which are scheduled to run in the current hour"}
  RePrioritizeSendPulses
  [_job-context]
  (reprioritize-send-pulses))

(defmethod task/init! ::SendPulses [_]
  (let [send-pulse-job       (jobs/build
                              (jobs/with-description  "Send Pulse")
                              (jobs/of-type SendPulse)
                              (jobs/with-identity send-pulse-job-key)
                              (jobs/store-durably))
        re-proritize-job     (jobs/build
                              (jobs/with-description  "Update send Pulses Priority")
                              (jobs/of-type RePrioritizeSendPulses)
                              (jobs/with-identity reprioritize-send-pulse-job-key)
                              (jobs/store-durably))
        re-proritize-trigger (triggers/build
                              (triggers/with-identity (triggers/key "metabase.task.send-pulses.reprioritize.trigger"))
                              (triggers/for-job reprioritize-send-pulse-job-key)
                              (triggers/start-now)
                              (triggers/with-schedule
                                (cron/schedule
                                 (cron/cron-schedule "0 0 1 ? * 7 *") ; at 1am on Saturday every week
                                 (cron/with-misfire-handling-instruction-ignore-misfires))))]
    (task/add-job! send-pulse-job)
    (task/add-job! re-proritize-job)
    (task/schedule-task! re-proritize-job re-proritize-trigger)
    (task/add-trigger! re-proritize-trigger)))

#_(doseq [trigger (:triggers (task/job-info "metabase.task.send-pulses.send-pulse.job"))]
    (task/delete-trigger! (triggers/key (:key trigger))))
#_(task/job-info "metabase.task.send-pulses.send-pulse.job")
