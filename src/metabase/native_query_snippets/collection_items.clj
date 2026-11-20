(ns metabase.native-query-snippets.collection-items
  "How the collection items listing shows the snippets.")

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of snippets of the collection items listing, without the columns that only other items have."
  [_collection _opts rows]
  (for [row rows]
    (-> (dissoc row
                :description :collection_position :display :authority_level
                :moderated_status :icon :personal_owner_id
                :dataset_query :table_id :query_type :is_upload :namespace)
        (assoc :collection_namespace "snippets"))))
