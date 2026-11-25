(ns metabase.actions.collection-items
  "How the collection items listing shows the actions."
  (:require
   [metabase.api.common :as api]))

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of actions of the collection items listing as the API shows them, with the namespace of `collection`."
  [collection _opts rows]
  (for [row rows]
    (-> (dissoc row
                :collection_position :display :authority_level :moderated_status :icon :personal_owner_id
                :dataset_query :table_id :query_type :is_upload :namespace)
        (update :archived api/bit->boolean)
        (update :archived_directly api/bit->boolean)
        (assoc :collection_namespace (some-> (:namespace collection) name)))))
