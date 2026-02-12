(ns metabase.transforms.timeout
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.task.core :as task]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.transforms.timeout")

(defn- timeout-transform-runs! [_ctx]
  (log/trace "Timing out old runs.")
  (try
    (transform-run/timeout-old-runs! (transforms.settings/transform-timeout) :minute)
    (catch Throwable t
      (log/error t "Error timing out old runs."))))

(task/defjob  ^{:doc "Timeout long-running tasks that have been lost by a worker."
                org.quartz.DisallowConcurrentExecution true}
  TimeoutTransforms [ctx]
  (timeout-transform-runs! ctx))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job (jobs/build
               (jobs/of-type TimeoutTransforms)
               (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes 10)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::TimeoutTransforms [_]
  (log/info "Scheduling timeout transforms task.")
  (start-job!))
