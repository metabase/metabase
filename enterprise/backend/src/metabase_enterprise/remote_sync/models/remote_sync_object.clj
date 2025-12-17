(ns metabase-enterprise.remote-sync.models.remote-sync-object
  (:require
   [clojure.set :as set]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/RemoteSyncObject [_model] :remote_sync_object)

(derive :model/RemoteSyncObject :metabase/model)

(defn dirty-global?
  "Checks if any collection has changes since the last sync.

  Returns true if any remote-synced object has a status other than 'synced', false otherwise."
  []
  (t2/exists? :model/RemoteSyncObject :status [:not= "synced"]))

(defn dirty-for-global
  "Gets all models in any collection that are dirty with their sync status.

  Returns a sequence of model maps that have changed since the last remote sync, including details about their
  current state and sync status."
  []
  (->> (t2/select :model/RemoteSyncObject :status [:not= "synced"])
       (map #(-> %
                 (dissoc :id)
                 (set/rename-keys {:model_id :id
                                   :model_name :name
                                   :model_type :model
                                   :model_collection_id :collection_id
                                   :model_display :display
                                   :status :sync_status})))
       (into [])))
