(ns metabase-enterprise.dependencies.task-util
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn job-delay
  "Generates a random delay in seconds based on `delay` and `variance`.

  Both `delay` and `variance` should be in minutes, and the result will vary between `delay-variance` and
  `delay+variance`."
  [delay variance]
  (let [delay-duration    (t/duration delay :minutes)
        variance-duration (t/duration variance :minutes)]
    (max 0 (.. delay-duration
               (minus variance-duration)
               (plusSeconds (rand-int (.. variance-duration
                                          (multipliedBy 2)
                                          toSeconds)))
               toSeconds))))

(defn job-initial-delay
  "Generates a random delay in seconds based on `variance`.

  `variance` is in minutes and the result will vary between 0 and `variance`"
  [variance]
  (rand-int (.toSeconds (t/duration variance :minutes))))

(defn schedule-run!
  "Schedule a run of the job of `job-type`, keyed by `job-key` and `trigger-key` and logged as `job-name`,
  `delay-in-seconds` from now on `scheduler`."
  [scheduler {:keys [job-type job-key trigger-key job-name]} delay-in-seconds]
  (let [start-at (-> (t/instant)
                     (t/+ (t/duration delay-in-seconds :seconds))
                     java.util.Date/from)
        trigger  (triggers/build
                  (triggers/with-identity (triggers/key trigger-key))
                  (triggers/for-job job-key)
                  (triggers/start-at start-at))
        job      (jobs/build (jobs/of-type job-type) (jobs/with-identity job-key))]
    (log/info "Scheduling next run of job" job-name "at" start-at)
    (task/schedule-task! scheduler job trigger)))
