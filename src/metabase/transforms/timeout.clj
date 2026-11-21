(ns metabase.transforms.timeout
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.quartz JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.transforms.timeout")

(mu/defn- timeout-transform-runs! :- :nil
  [_ctx :- (ms/InstanceOfClass JobExecutionContext)]
  (tracing/with-span :tasks "task.transform.timeout-check" {:transform.timeout/type "transform"}
    (when-let [timed-out (not-empty (transform-run/timeout-old-runs! (transforms.settings/transform-timeout) :minute))]
      (log/infof "Timed out %d transform run(s)." (count timed-out))))
  nil)

(task/defjob TimeoutTransforms
  "Timeout long-running tasks that have been lost by a worker."
  {:saved-class "metabase.transforms.timeout.TimeoutTransforms"
   :concurrent? false}
  [ctx]
  (timeout-transform-runs! ctx))

(mu/defn- start-job! :- :nil
  []
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
      (task/schedule-task! job trigger)))
  nil)

(defmethod task/init! ::TimeoutTransforms [_]
  (log/info "Scheduling timeout transforms task.")
  (start-job!))
