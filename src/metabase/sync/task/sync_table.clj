(ns metabase.sync.task.sync-table
  "Task that syncs one Table on request, with one such run at a time across the cluster."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.sync :as sync]
   [metabase.sync.task.util :as sync.task.util]
   [metabase.task.core :as task]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- sync-table!
  "Sync, analyze and scan the FieldValues of the Table with `table-id`, if it exists."
  [table-id]
  (some-> (sync.db/table table-id) sync/sync-table!))

(task/defjob SyncTable
  "Sync, analyze and scan the FieldValues of one Table."
  {:saved-class "metabase.sync.task.sync_table.SyncTable"
   :concurrent? false}
  [job-context]
  (sync.task.util/run-for-target! sync-table! job-context))

(def ^:private job
  (sync.task.util/job SyncTable "metabase.task.sync-table.job" "Sync Table"))

(mu/defn schedule-table-sync!
  "Request a sync of the Table with `table-id`, which joins a request for it that still waits."
  [table-id :- ::lib.schema.id/table]
  (sync.task.util/schedule! job table-id sync-table!))
