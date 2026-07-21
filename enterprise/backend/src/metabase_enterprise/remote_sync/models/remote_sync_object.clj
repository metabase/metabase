(ns metabase-enterprise.remote-sync.models.remote-sync-object
  "Model and queries for tracking remote-synced objects and their dirty state.

   The RemoteSyncObject table stores denormalized information about objects that are
   tracked for remote synchronization. This includes the object's name, collection_id,
   and for Field/Segment/Table models, parent table information."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.remote-sync.settings :as rs-settings]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncObject [_model] :remote_sync_object)

(derive :model/RemoteSyncObject :metabase/model)

;;; ------------------------------------------------- Public API -------------------------------------------------------

(defn- dirty-where
  "WHERE clause for un-synced rows, scoped by branch: a personal `branch` sees
   only its own rows; the global view (nil) sees legacy NULL rows and the global
   sync branch's rows. Excludes disabled model types."
  [branch]
  (let [excluded (spec/excluded-model-types)]
    [:and
     [:not= :status "synced"]
     (when (seq excluded)
       [:not-in :model_type excluded])
     (if branch
       [:= :branch branch]
       [:or [:= :branch nil] [:= :branch (rs-settings/remote-sync-branch)]])]))

(defn dirty?
  "Checks if any collection has changes since the last sync, scoped to `branch`
   (nil = the global sync branch view)."
  ([] (dirty? nil))
  ([branch]
   (t2/exists? :model/RemoteSyncObject {:where (dirty-where branch)})))

(defn dirty-rows
  "Returns the raw RemoteSyncObject rows that are not yet synced (status != 'synced'),
  scoped to `branch` (nil = the global sync branch view)."
  ([] (dirty-rows nil))
  ([branch]
   (t2/select :model/RemoteSyncObject {:where (dirty-where branch)})))

(defn dirty-objects
  "Gets all models in any collection that are dirty with their sync status,
   scoped to `branch` (nil = the global sync branch view)."
  ([] (dirty-objects nil))
  ([branch]
   (->> (dirty-rows branch)
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
