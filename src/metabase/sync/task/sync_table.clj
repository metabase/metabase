(ns metabase.sync.task.sync-table
  "Task that syncs Tables on request, one Table at a time across the cluster."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.sync :as sync]
   [metabase.task.core :as task]
   [metabase.util.malli :as mu]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase.task.sync-table.job"))

(defn- sync-table!
  "Sync, analyze and scan the FieldValues of the Table with `table-id`, if it exists."
  [table-id]
  (some-> (sync.db/table table-id) sync/sync-table!))

(task/defjob SyncTable
  "Sync, analyze and scan the FieldValues of one Table."
  {:saved-class "metabase.sync.task.sync_table.SyncTable"
   :concurrent? false}
  [job-context]
  (sync-table! (get (qc/from-job-data job-context) "table-id")))

(def ^:private job
  (jobs/build
   (jobs/with-description "Sync one Table")
   (jobs/of-type SyncTable)
   (jobs/with-identity job-key)
   (jobs/store-durably)))

(defn- trigger [table-id]
  (triggers/build
   (triggers/with-description (format "Sync Table %d" table-id))
   (triggers/with-identity (triggers/key (format "metabase.task.sync-table.trigger.%d" table-id)))
   (triggers/using-job-data {"table-id" table-id})
   (triggers/for-job job-key)
   (triggers/start-now)))

(mu/defn schedule-table-sync!
  "Queue one sync of the Table with `table-id`, unless one is already waiting."
  [table-id :- ::lib.schema.id/table]
  (or (task/schedule-once! job (trigger table-id))
      (quick-task/submit-task! #(sync-table! table-id))))

(defmethod task/init! ::SyncTable
  [_]
  (task/add-job! job))
