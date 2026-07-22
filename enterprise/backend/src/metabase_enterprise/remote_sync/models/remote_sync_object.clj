(ns metabase-enterprise.remote-sync.models.remote-sync-object
  "Model and queries for tracking remote-synced objects and their dirty state.

   The RemoteSyncObject table stores denormalized information about objects that are
   tracked for remote synchronization. This includes the object's name, collection_id,
   and for Field/Segment/Table models, parent table information."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.remote-sync.models.remote-sync-worktree :as remote-sync.worktree]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncObject [_model] :remote_sync_object)

(derive :model/RemoteSyncObject :metabase/model)

;;; ------------------------------------------------- Public API -------------------------------------------------------

(defn- dirty-where
  "WHERE clause for unsynced rows: status filter, disabled model types (e.g. transforms when transform
  sync is off), and ledger scoping — the given worktree's, or with a nil `worktree-id` the default
  worktree's (which also owns rows that predate worktrees), so one worktree's unpushed changes never
  dirty another's flows."
  [worktree-id]
  (let [excluded (spec/excluded-model-types)]
    (cond-> [:and
             [:not= :status "synced"]
             (remote-sync.worktree/worktree-filter-clause worktree-id)]
      (seq excluded) (conj [:not-in :model_type excluded]))))

(defn dirty?
  "Checks if any collection has changes since the last sync.
   Returns true if any remote-synced object has a status other than 'synced', false otherwise.
   With `worktree-id`, only considers that worktree's ledger."
  ([]
   (dirty? nil))
  ([worktree-id]
   (t2/exists? :model/RemoteSyncObject {:where (dirty-where worktree-id)})))

(defn dirty-rows
  "Returns the raw RemoteSyncObject rows that are not yet synced (status != 'synced'),
  excluding disabled model types (e.g. transforms when transform sync is off).
  With `worktree-id`, only that worktree's rows."
  ([]
   (dirty-rows nil))
  ([worktree-id]
   (t2/select :model/RemoteSyncObject {:where (dirty-where worktree-id)})))

(defn dirty-objects
  "Gets all models in any collection that are dirty with their sync status.
   Returns a sequence of model maps that have changed since the last remote sync,
   including details about their current state and sync status.
   Excludes transform model types when transform sync is disabled.
   With `worktree-id`, only that worktree's ledger."
  ([]
   (dirty-objects nil))
  ([worktree-id]
   (->> (dirty-rows worktree-id)
        (map #(-> %
                  (dissoc :id :status_changed_at)
                  (set/rename-keys {:model_id :id
                                    :model_name :name
                                    :model_type :model
                                    :model_collection_id :collection_id
                                    :model_display :display
                                    :model_table_id :table_id
                                    :model_table_name :table_name
                                    :status :sync_status})
                  (update :model u/lower-case-en)))
        (into []))))
