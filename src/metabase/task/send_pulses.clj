(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
  (:require
   [clj-time.core :as time]
   [clj-time.predicates :as timepr]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.driver :as driver]
   [metabase.models :refer [PulseChannel]]
   [metabase.models.pulse :as pulse]
   [metabase.models.pulse-channel :as pulse-channel]
   [metabase.models.task-history :as task-history]
   [metabase.pulse]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------

(defn- log-pulse-exception [pulse-id exception]
  (log/errorf exception "Error sending Pulse %d" pulse-id))

(def ^:private Hour
  [:int {:min 0 :max 23}])

(def ^:private Weekday
  [:fn pulse-channel/day-of-week?])

(def ^:private MonthDay
  [:enum :first :last :mid :other])

(def ^:private MonthWeek
  [:enum :first :last :other])

(mu/defn ^:private send-pulses!
  "Send any `Pulses` which are scheduled to run in the current day/hour. We use the current time and determine the
  hour of the day and day of the week according to the defined reporting timezone, or UTC. We then find all `Pulses`
  that are scheduled to run and send them. The `on-error` function is called if an exception is thrown when sending
  the pulse. Since this is a background process, the exception is only logged and not surfaced to the user. The
  `on-error` function makes it easier to test for when an error doesn't occur"
  ([hour weekday monthday monthweek]
   (send-pulses! hour weekday monthday monthweek log-pulse-exception))

  ([hour :- Hour, weekday :- Weekday, monthday :- MonthDay, monthweek :- MonthWeek, on-error]
   (log/info "Sending scheduled pulses...")
   (let [pulse-id->channels (group-by :pulse_id (pulse-channel/retrieve-scheduled-channels hour weekday monthday monthweek))]
     (doseq [[pulse-id channels] pulse-id->channels]
       (try
         (task-history/with-task-history {:task         "send-pulse"
                                          :task_details {:pulse-id pulse-id}}
           (log/debugf "Starting Pulse Execution: %d" pulse-id)
           (when-let [pulse (pulse/retrieve-notification pulse-id :archived false)]
             (metabase.pulse/send-pulse! pulse :channel-ids (map :id channels)))
           (log/debugf "Finished Pulse Execution: %d" pulse-id))
         (catch Throwable e
           (on-error pulse-id e)))))))

; Clearing pulse channels is not done synchronously in order to support undoing feature.
(defn- clear-pulse-channels!
  []
  (when-let [ids-to-delete (seq
                            (for [channel (t2/select [PulseChannel :id :details]
                                                     :id [:not-in {:select   [[:pulse_channel_id :id]]
                                                                   :from     :pulse_channel_recipient
                                                                   :group-by [:pulse_channel_id]
                                                                   :having   [:>= :%count.* [:raw 1]]}])]
                              (when (and (empty? (get-in channel [:details :emails]))
                                         (not (get-in channel [:details :channel])))
                                (:id channel))))]
   (t2/delete! PulseChannel :id [:in ids-to-delete])))

;;; ------------------------------------------------------ Task ------------------------------------------------------

(defn- monthday [dt]
  (cond
    (timepr/first-day-of-month? dt) :first
    (timepr/last-day-of-month? dt)  :last
    (= 15 (time/day dt))            :mid
    :else                           :other))

(defn- monthweek [dt]
  (let [curr-day-of-month  (time/day dt)
        last-of-month      (time/day (time/last-day-of-the-month dt))
        start-of-last-week (- last-of-month 7)]
    (cond
      (> 8 curr-day-of-month)                  :first
      (< start-of-last-week curr-day-of-month) :last
      :else                                    :other)))

(jobs/defjob ^{:doc "Triggers the sending of all pulses which are scheduled to run in the current hour"} SendPulses [_]
  (try
    (task-history/with-task-history {:task "send-pulses"}
      ;; determine what time it is right now (hour-of-day & day-of-week) in reporting timezone
      (let [reporting-timezone (driver/report-timezone)
            now                (if (empty? reporting-timezone)
                                 (time/now)
                                 (time/to-time-zone (time/now) (time/time-zone-for-id reporting-timezone)))
            curr-hour          (time/hour now)
            ;; joda time produces values of 1-7 here (Mon -> Sun) and we subtract 1 from it to
            ;; make the values zero based to correspond to the indexes in pulse-channel/days-of-week
            curr-weekday       (->> (dec (time/day-of-week now))
                                    (get pulse-channel/days-of-week)
                                    :id)
            curr-monthday      (monthday now)
            curr-monthweek     (monthweek now)]
        (send-pulses! curr-hour curr-weekday curr-monthday curr-monthweek))
      (clear-pulse-channels!))
    (catch Throwable e
      (log/error e "SendPulses task failed"))))

(def ^:private send-pulses-job-key     "metabase.task.send-pulses.job")
(def ^:private send-pulses-trigger-key "metabase.task.send-pulses.trigger")

(defmethod task/init! ::SendPulses [_]
  (let [job     (jobs/build
                 (jobs/of-type SendPulses)
                 (jobs/with-identity (jobs/key send-pulses-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key send-pulses-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   (cron/schedule
                    ;; run at the top of every hour
                    (cron/cron-schedule "0 0 * * * ? *")
                    ;; If send-pulses! misfires, don't try to re-send all the misfired Pulses. Retry only the most
                    ;; recent misfire, discarding all others. This should hopefully cover cases where a misfire
                    ;; happens while the system is still running; if the system goes down for an extended period of
                    ;; time we don't want to re-send tons of (possibly duplicate) Pulses.
                    ;;
                    ;; See https://www.nurkiewicz.com/2012/04/quartz-scheduler-misfire-instructions.html
                    (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    (task/schedule-task! job trigger)))
