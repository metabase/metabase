(ns metabase.activity-feed.recent-views.render
  "Helpers for the `:render` fns of the recent views specs."
  (:require
   [metabase.collections.models.collection.root :as root]))

(set! *warn-on-reflection* true)

(defn elide-archived
  "The `row` when it is not archived, so that archived items are not shown in the recent views."
  [row]
  (when (false? (:archived row)) row))

(defn root-collection
  "The parent collection of an item in the root collection."
  []
  (select-keys
   (root/root-collection-with-ui-details nil)
   [:id :name :authority_level]))

(defn parent-collection
  "The parent collection of the `row`, loaded with the `collection_*` columns of its Collection."
  [row]
  (if (:collection_id row)
    {:id              (:collection_id row)
     :name            (:collection_name row)
     :authority_level (some-> (:collection_authority_level row) name)}
    (root-collection)))

(defn parent-collection-valid?
  "Whether the Collection of the `row` exists. The root collection has a nil `collection_id` and a nil `entity-coll-id`,
  an existing Collection has both, and a missing one has only an `entity-coll-id`."
  [{:keys [collection_id entity-coll-id]}]
  (not (and entity-coll-id (nil? collection_id))))
