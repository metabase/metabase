(ns metabase.task.send-pulses
  "Tasks related to running `Pulses`."
  (:require [clj-time
             [core :as time]
             [predicates :as timepr]]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [metabase
             [pulse :as p]
             [task :as task]]
            [metabase.models
             [pulse :as pulse]
             [pulse-channel :as pulse-channel]
             [setting :as setting]]))

(declare send-pulses!)

(def ^:private ^:const send-pulses-job-key     "metabase.task.send-pulses.job")
(def ^:private ^:const send-pulses-trigger-key "metabase.task.send-pulses.trigger")

(defonce ^:private send-pulses-job (atom nil))
(defonce ^:private send-pulses-trigger (atom nil))

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

;; triggers the sending of all pulses which are scheduled to run in the current hour
(jobs/defjob SendPulses
  [ctx]
  ;; determine what time it is right now (hour-of-day & day-of-week) in reporting timezone
  (let [reporting-timezone (setting/get :report-timezone)
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
    (send-pulses! curr-hour curr-weekday curr-monthday curr-monthweek)))

(defn task-init
  "Automatically called during startup; start the job for sending pulses."
  []
  ;; build our job
  (reset! send-pulses-job (jobs/build
                           (jobs/of-type SendPulses)
                           (jobs/with-identity (jobs/key send-pulses-job-key))))
  ;; build our trigger
  (reset! send-pulses-trigger (triggers/build
                               (triggers/with-identity (triggers/key send-pulses-trigger-key))
                               (triggers/start-now)
                               (triggers/with-schedule
                                 ;; run at the top of every hour
                                 (cron/cron-schedule "0 0 * * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @send-pulses-job @send-pulses-trigger))


;;; ------------------------------------------------- PULSE SENDING --------------------------------------------------

(defn- log-pulse-exception [pulse-id exception]
  (log/error "Error sending pulse:" pulse-id exception))

(defn- send-pulses!
  "Send any `Pulses` which are scheduled to run in the current day/hour. We use the current time and determine the
  hour of the day and day of the week according to the defined reporting timezone, or UTC. We then find all `Pulses`
  that are scheduled to run and send them. The `on-error` function is called if an exception is thrown when sending
  the pulse. Since this is a background process, the exception is only logged and not surfaced to the user. The
  `on-error` function makes it easier to test for when an error doesn't occur"
  ([hour weekday monthday monthweek]
   (send-pulses! hour weekday monthday monthweek log-pulse-exception))
  ([hour weekday monthday monthweek on-error]
   {:pre [(integer? hour)
          (and (<= 0 hour) (>= 23 hour))
          (pulse-channel/day-of-week? weekday)
          (contains? #{:first :last :mid :other} monthday)
          (contains? #{:first :last :other} monthweek)]}
   (let [channels-by-pulse (group-by :pulse_id (pulse-channel/retrieve-scheduled-channels hour weekday monthday monthweek))]
     (doseq [pulse-id (keys channels-by-pulse)]
       (try
         (log/debug (format "Starting Pulse Execution: %d" pulse-id))
         (when-let [pulse (pulse/retrieve-notification pulse-id :archived false)]
           (p/send-pulse! pulse :channel-ids (mapv :id (get channels-by-pulse pulse-id))))
         (log/debug (format "Finished Pulse Execution: %d" pulse-id))
         (catch Throwable e
           (on-error pulse-id e)))))))
