(ns metabase.sync.task.sync-database
  "Task that syncs and analyzes one Database on request; as a Quartz job it has one run at a time for each Database
  across the cluster."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.database-routing.core :as database-routing]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.db :as sync.db]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.task.core :as task]
   [metabase.util.malli :as mu]
   [metabase.util.quick-task :as quick-task])
  (:import
   (org.quartz JobDetail)))

(set! *warn-on-reflection* true)

(defn- sync-database!
  "Sync and analyze the Database with `database-id`, if it exists."
  [database-id]
  (when-let [database (sync.db/database database-id)]
    (database-routing/with-database-routing-off
      (sync-metadata/sync-db-metadata-explicit! database)
      (analyze/analyze-db-explicit! database))))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Sync and analyze one Database under the timeout of quick tasks, and throw what the sync throws so that Quartz records a failed run."}
  SyncDatabase [job-context]
  (let [database-id (get (qc/from-job-data job-context) "id")]
    (some-> (quick-task/run-with-timeout! #(try
                                             (sync-database! database-id)
                                             nil
                                             (catch Exception e
                                               e)))
            throw)))

(defn- job
  "The job that syncs the Database with `database-id`, with a key of its own so that each Database has one run at a
  time, and one name in metrics for all Databases."
  ^JobDetail [database-id]
  (jobs/build
   (jobs/with-description (format "Sync Database %d" database-id))
   (jobs/of-type SyncDatabase)
   (jobs/using-job-data {"id"                      database-id
                         task/metrics-job-name-key "metabase.task.sync-database.job"})
   (jobs/with-identity (jobs/key (format "metabase.task.sync-database.job.%d" database-id)))))

(defn- trigger
  "A one-shot trigger of the job that syncs the Database with `database-id`, with the same key for every request, that
  ignores misfires so that it fires as soon as a thread is free however long it waited."
  [database-id]
  (triggers/build
   (triggers/with-description (format "Sync Database %d" database-id))
   (triggers/with-identity (triggers/key (format "metabase.task.sync-database.trigger.%d" database-id)))
   (triggers/for-job (.getKey (job database-id)))
   (triggers/start-now)
   (triggers/with-schedule
    (simple/schedule
     (simple/with-misfire-handling-instruction-ignore-misfires)))))

(mu/defn schedule-database-sync!
  "Request a sync and analysis of the Database with `database-id`, which replaces a waiting request for that Database
  when this node has a running scheduler and is queued on the quick-task executor of this node otherwise."
  [database-id :- ::lib.schema.id/database]
  (or (task/schedule-once! (job database-id) (trigger database-id))
      (quick-task/submit-task! #(sync-database! database-id))))
