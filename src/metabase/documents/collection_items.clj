(ns metabase.documents.collection-items
  "How the collection items listing shows the Documents."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of Documents of the collection items listing as the API shows them, with their location in `collection`
  and what the user can do with them."
  [collection _opts rows]
  (map #(dissoc % :exploration_id)
       (t2/hydrate (for [document rows]
                     (-> (t2/instance :model/Document document)
                         (assoc :location (or (when collection
                                                (collection/children-location collection))
                                              "/"))
                         (dissoc :namespace)
                         (update :archived api/bit->boolean)
                         (update :archived_directly api/bit->boolean)))
                   :can_write :can_restore :can_delete :is_remote_synced :collection_namespace)))
