(ns metabase.sync.task.util
  "Helpers for the tasks that run one sync operation for one Database, Table or Field on request."
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
  "A one-shot trigger of `job` for the target `id`, with a key that is the same for every request of that target, that
  keeps its place among waiting triggers however long it waits."
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

(defn run-for-target!
  "Call `f` with the target id that `job-context` carries, logging the message of what it throws."
  [f ^JobExecutionContext job-context]
  (let [id (get (qc/from-job-data job-context) "id")]
    (try
      (f id)
      (catch Exception e
        (log/warnf "%s failed for %d: %s" (.. job-context getJobDetail getKey getName) id (ex-message e))))))

(defn schedule!
  "Request a run of `f` for the target `id` as a run of `job`, or on this node when it has no running scheduler."
  [job id f]
  (or (task/schedule-once! job (trigger job id))
      (quick-task/submit-task! #(f id))))
