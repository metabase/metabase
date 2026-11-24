(ns metabase.pulse.collection-items
  "How the collection items listing shows the Pulses.")

(set! *warn-on-reflection* true)

(defn hydrate
  "The `rows` of Pulses of the collection items listing, without the columns that only other items have."
  [_collection _opts rows]
  (for [row rows]
    (dissoc row
            :description :display :authority_level :moderated_status :icon :personal_owner_id :namespace
            :dataset_query :table_id :query_type :is_upload :collection_namespace)))
