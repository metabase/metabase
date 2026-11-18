(ns metabase.sync.task.util
  "Helpers for the tasks that sync one Database or Table on request."
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.util.quick-task :as quick-task])
  (:import
   (org.quartz JobDetail JobExecutionContext)))

(set! *warn-on-reflection* true)

(defn job
  "A job of `job-class` for the target `id`, with a key of its own that starts with `job-name`, so that a job that
  disallows concurrent execution has one run at a time for that target."
  ^JobDetail [job-class job-name description id]
  (jobs/build
   (jobs/with-description (format "%s %d" description id))
   (jobs/of-type job-class)
   (jobs/using-job-data {"id" id})
   (jobs/with-identity (jobs/key (format "%s.job.%d" job-name id)))))

(defn- trigger
  "A one-shot trigger of `job`, with the same key for every request of the target of `job`, that ignores misfires so
  that it fires as soon as a thread is free however long it waited."
  [^JobDetail job]
  (let [job-key (.getKey job)]
    (triggers/build
     (triggers/with-description (.getDescription job))
     (triggers/with-identity (triggers/key (str/replace (.getName job-key) ".job." ".trigger.")))
     (triggers/for-job job-key)
     (triggers/start-now)
     (triggers/with-schedule
      (simple/schedule
       (simple/with-misfire-handling-instruction-ignore-misfires))))))

(defn run-for-target!
  "Run `f`, the work of a job for one target, with the target id that `job-context` carries, under the timeout of quick
  tasks, and throw what `f` throws so that Quartz records a failed run."
  [f ^JobExecutionContext job-context]
  (let [id (get (qc/from-job-data job-context) "id")]
    (some-> (quick-task/run-with-timeout! #(try
                                             (f id)
                                             nil
                                             (catch Exception e
                                               e)))
            throw)))

(defn schedule!
  "Request a run of `job`, whose target is `id`, or submit `f`, the work of `job`, to the quick-task executor of this
  node when the run cannot be scheduled."
  [job id f]
  (or (task/schedule-once! job (trigger job))
      (quick-task/submit-task! #(f id))))
