(ns metabase.pulse.task.send-pulses-trigger
  "Quartz trigger lifecycle for the SendPulse job.

  Separate from [[metabase.pulse.task.send-pulses]] so that PulseChannel model hooks can (un)schedule triggers: the job
  body over there loads the sending machinery, which reads the models."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.pulse.db :as pulse.db]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.task.core :as task]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.util TimeZone)
   (org.quartz CronTrigger TriggerKey)))

(set! *warn-on-reflection* true)

(def send-pulse-job-key
  "Key of the Quartz job that sends a pulse when one of its triggers fires."
  (jobs/key "metabase.task.send-pulses.send-pulse.job"))

(defn- send-pulse-trigger-key
  ^TriggerKey [pulse-id schedule-map]
  (triggers/key (format "metabase.task.send-pulse.trigger.%d.%s"
                        pulse-id (-> (select-keys schedule-map u.cron/schedule-keys)
                                     u.cron/schedule-map->cron-string
                                     (str/replace " " "_")))))

(defn- send-pulse-trigger-key->info
  [trigger-key]
  (let [[_ pulse-id schedule-str] (re-matches #"metabase\.task\.send-pulse\.trigger\.(\d+)\.(.*)" trigger-key)]
    {:pulse-id     (parse-long pulse-id)
     :schedule-map (-> schedule-str
                       (str/replace "_" " ")
                       u.cron/cron-string->schedule-map)}))

(defn- send-trigger-timezone
  []
  (or (driver/report-timezone)
      (qp.timezone/system-timezone-id)
      "UTC"))

(mu/defn- send-pulse-trigger
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
      (cron/cron-schedule (u.cron/schedule-map->cron-string (select-keys schedule-map u.cron/schedule-keys)))
      (cron/in-time-zone (TimeZone/getTimeZone ^String timezone))
      ;; If the trigger is misfired, fire it immediately and proceed with the next scheduled time.
      ;; TODO: upon testing, look like re-firing on startup is not working as expected
      ;;
      ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html for more info
      (cron/with-misfire-handling-instruction-fire-and-proceed)))
    (triggers/with-priority priority))))

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
  (let [schedule-map     (update-vals (select-keys schedule-map u.cron/schedule-keys)
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
      ;; no op when new-pc-ids doesn't change
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

(defn- active-dashsub-pcs
  []
  (pulse.db/active-dashboard-subscription-channels))

(defn init-dashboard-subscription-triggers!
  "Update send pulse triggers for all active pulses.
  Called once when Metabase starts up to create triggers for all existing PulseChannels"
  []
  (assert (task/scheduler) "Scheduler must be started before initializing SendPulse triggers")
  (let [trigger-slot->pc-ids (as-> (active-dashsub-pcs) results
                               (group-by #(select-keys % [:pulse_id :schedule_type :schedule_day :schedule_hour :schedule_frame]) results)
                               (update-vals results #(map :id %)))]
    (doseq [[{:keys [pulse_id] :as schedule-map} pc-ids] trigger-slot->pc-ids]
      (update-send-pulse-trigger-if-needed! pulse_id schedule-map :add-pc-ids (set pc-ids)))))
