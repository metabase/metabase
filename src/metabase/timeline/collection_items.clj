(ns metabase.timeline.collection-items
  "How the collection items listing shows the Timelines.")

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of Timelines of the collection items listing, without the columns that only other items have."
  [_collection _opts rows]
  (for [row rows]
    (dissoc row
            :description :display :collection_position :authority_level :moderated_status
            :dataset_query :table_id :query_type :is_upload :namespace)))
