(ns metabase.premium-features.task.send-metering
  "Scheduled task that sends metering events for billing purposes."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.premium-features.settings :as settings]
   [metabase.premium-features.token-check :as token-check]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private min-interval-ms (u/minutes->ms 1))
(def ^:private max-interval-ms (u/hours->ms 12))
(def ^:private default-interval-ms (u/minutes->ms 15))

(defn- metering-interval-ms
  "Returns the metering interval in milliseconds, clamped between 1 minute and 12 hours.
   Defaults to 15 minutes if not set."
  []
  (if-let [v (settings/send-metering-interval-ms)]
    (max min-interval-ms (min max-interval-ms v))
    default-interval-ms))

(task/defjob ^{:doc "Send metering events for billing purposes"}
  SendMeteringEvents
  [_]
  (log/debug "Running metering events task")
  (token-check/send-metering-events!))

(def ^:private job-key "metabase.task.send-metering.job")
(def ^:private trigger-key "metabase.task.send-metering.trigger")

(defmethod task/init! ::SendMeteringEvents
  [_]
  (let [job     (jobs/build
                 (jobs/of-type SendMeteringEvents)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-interval-in-milliseconds (metering-interval-ms))
                   (simple/repeat-forever))))]
    (task/schedule-task! job trigger)))
