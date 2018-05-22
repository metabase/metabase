(ns metabase.task.cleanup-temporary-computation-job-results
  "Cleanup of old async computation results."
  (:require [clj-time
             [coerce :as t.coerce]
             [core :as t]]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.daily-interval :as interval]
            [metabase.task :as task]
            [toucan.db :as db]))

(def ^:private temporary-result-lifetime (t/days 3))

(defn- cleanup-temporary-results!
  []
  (db/simple-delete! 'ComputationJobResult
    :created_at [:< (-> (t/now)
                        (t/minus temporary-result-lifetime)
                        t.coerce/to-sql-time)]
    :permanence "temporary"))

(def ^:private ^:const cleanup-job-key     "metabase.task.cleanup-temporary-computation-job-results.job")
(def ^:private ^:const cleanup-trigger-key "metabase.task.cleanup-temporary-computation-job-results.trigger")

(jobs/defjob Cleanup
  [ctx]
  (cleanup-temporary-results!))

(defonce ^:private cleanup-job (atom nil))
(defonce ^:private cleanup-trigger (atom nil))

(defn task-init
  "Automatically called during startup; start the job for sending pulses."
  []
  (reset! cleanup-job (jobs/build
                       (jobs/of-type Cleanup)
                       (jobs/with-identity (jobs/key cleanup-job-key))))
  (reset! cleanup-trigger (triggers/build
                           (triggers/with-identity
                             (triggers/key cleanup-trigger-key))
                           (triggers/start-now)
                           (triggers/with-schedule
                             ;; once per day at 3AM
                             (interval/schedule
                              (interval/starting-daily-at
                               (interval/time-of-day 03 00 00))))))
  (task/schedule-task! @cleanup-job @cleanup-trigger))
