(ns metabase-enterprise.remote-sync.models.remote-sync-object
  "Model and queries for tracking remote-synced objects and their dirty state.

   The RemoteSyncObject table stores denormalized information about objects that are
   tracked for remote synchronization. This includes the object's name, collection_id,
   and for Field/Segment/Table models, parent table information."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncObject [_model] :remote_sync_object)

(derive :model/RemoteSyncObject :metabase/model)

(t2/define-before-insert :model/RemoteSyncObject
  [row]
  (update row :worktree_id #(or % (remote-sync/default-worktree-id))))

;;; ------------------------------------------------- Public API -------------------------------------------------------

(defn dirty?
  "Checks if any collection has changes since the last sync, within `worktree-id` (the default worktree is the main app).
   Returns true if any remote-synced object has a status other than 'synced', false otherwise.
   Excludes transform model types when transform sync is disabled."
  ([] (dirty? (remote-sync/default-worktree-id)))
  ([worktree-id]
   (let [excluded (spec/excluded-model-types)]
     (if (empty? excluded)
       (t2/exists? :model/RemoteSyncObject :status [:not= "synced"] :worktree_id worktree-id)
       (t2/exists? :model/RemoteSyncObject
                   :status [:not= "synced"]
                   :model_type [:not-in excluded]
                   :worktree_id worktree-id)))))

(defn dirty-rows
  "Returns the raw RemoteSyncObject rows that are not yet synced (status != 'synced') within `worktree-id` (the default worktree is
  the main app), excluding disabled model types (e.g. transforms when transform sync is off)."
  ([] (dirty-rows (remote-sync/default-worktree-id)))
  ([worktree-id]
   (let [excluded (spec/excluded-model-types)]
     (if (empty? excluded)
       (t2/select :model/RemoteSyncObject :status [:not= "synced"] :worktree_id worktree-id)
       (t2/select :model/RemoteSyncObject
                  :status [:not= "synced"]
                  :model_type [:not-in excluded]
                  :worktree_id worktree-id)))))

(defn dirty-objects
  "Gets all models in any collection that are dirty with their sync status, within `worktree-id` (the default worktree is the
   main app).
   Returns a sequence of model maps that have changed since the last remote sync,
   including details about their current state and sync status.
   Excludes transform model types when transform sync is disabled."
  ([] (dirty-objects (remote-sync/default-worktree-id)))
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
