(ns metabase.sync.task.util
  "Helpers for the tasks that sync one Database or Table on request."
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task])
  (:import
   (org.quartz JobDetail JobExecutionContext)))

(set! *warn-on-reflection* true)

(defn job
  "A durable job of `job-class` with the key `job-name`."
  ^JobDetail [job-class job-name description]
  (jobs/build
   (jobs/with-description description)
   (jobs/of-type job-class)
   (jobs/with-identity (jobs/key job-name))
   (jobs/store-durably)))

(defn- trigger
  "A one-shot trigger of `job` for the target `id`, with the same key for every request of that target, that ignores
  misfires so that a long wait does not move it ahead of triggers requested before it."
  [^JobDetail job id]
  (let [job-key (.getKey job)]
    (triggers/build
     (triggers/with-description (format "%s %d" (.getDescription job) id))
     (triggers/with-identity (triggers/key (format "%s.trigger.%d" (str/replace (.getName job-key) #"\.job$" "") id)))
     (triggers/using-job-data {"id" id})
     (triggers/for-job job-key)
     (triggers/start-now)
     (triggers/with-schedule
      (simple/schedule
       (simple/with-misfire-handling-instruction-ignore-misfires))))))

(defn- run-work!
  "Call `f` with `id`, logging the message of an exception that it throws and not rethrowing it."
  [^JobDetail job f id]
  (try
    (f id)
    (catch Exception e
      (log/warnf "%s failed for %d: %s" (.. job getKey getName) id (ex-message e)))))

(defn run-for-target!
  "Run `f`, the work of a job for one target, with the target id that `job-context` carries, under the timeout of quick
  tasks."
  [f ^JobExecutionContext job-context]
  (let [job (.getJobDetail job-context)
        id  (get (qc/from-job-data job-context) "id")]
    (quick-task/run-with-timeout! #(run-work! job f id))))

(defn schedule!
  "Request a run of `job` for the target `id`, or submit `f`, the work of `job` for one target, to the quick-task
  executor of this node when the run cannot be scheduled."
  [job id f]
  (or (task/schedule-once! job (trigger job id))
      (quick-task/submit-task! #(run-work! job f id))))
