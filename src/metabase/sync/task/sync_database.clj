(ns metabase.sync.task.sync-database
  "Task that syncs and analyzes one Database on request; as a Quartz job it has one run at a time for each Database across the cluster."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.db :as sync.db]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.task.util :as sync.task.util]
   [metabase.task.core :as task]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- sync-database!
  "Sync and analyze the Database with `database-id`, if it exists."
  [database-id]
  (when (sync.db/database-exists? database-id)
    (sync-metadata/sync-db-metadata-explicit! database-id)
    (analyze/analyze-db-explicit! database-id)))

(task/defjob SyncDatabase
  "Sync and analyze one Database."
  {:saved-class "metabase.sync.task.sync_database.SyncDatabase"
   :concurrent? false}
  [job-context]
  (sync.task.util/run-for-target! sync-database! job-context))

(defn- job
  "The job that syncs the Database with `database-id`."
  [database-id]
  (sync.task.util/job SyncDatabase "metabase.task.sync-database" "Sync Database" database-id))

(mu/defn schedule-database-sync!
  "Request a sync and analysis of the Database with `database-id`, which replaces a waiting request for that Database
  when this node has a running scheduler and is queued on the quick-task executor of this node otherwise."
  [database-id :- ::lib.schema.id/database]
  (sync.task.util/schedule! (job database-id) database-id sync-database!))
