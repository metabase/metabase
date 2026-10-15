(ns metabase-enterprise.library-branching.instance.kinds.collection
  "The app DB side of the kind `:collection`, in the item form of `format.kinds.collection`. Not content: the slug
  (from the name), the archive columns (scope), `is_sample`, `is_remote_synced` and the bookkeeping columns."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.collection :as format.collection]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(defn parent-id
  "The id of the parent collection of a collection at `location` (`/1/5/` gives 5), or nil at the root level."
  [location]
  (some-> (re-find #"(\d+)/$" (str location)) second parse-long))

(defn attrs
  "The attributes of collection row `row`, with none at its default."
  [row]
  (->> (select-keys row (keys (:attrs format.collection/spec)))
       portable/document
       (content/attrs format.collection/spec)))

(defn- portable-content
  [{:keys [location] :as row}]
  {:place (serdes/*export-fk* (parent-id location) :model/Collection)
   :attrs (attrs row)})

(defn read-collections
  "`{entity-id item}` of the collections of `entity-ids`."
  [entity-ids]
  (let [rows     (content/in-chunks library-branching.db/collections-by-entity-id (vec entity-ids))
        contents (portable/export-batch portable-content rows)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item :collection entity_id name place attrs)])
               rows
               contents))))

(def kind-store
  "The `KindStore` of collections."
  (reify instance/KindStore
    (read-all [_ ids] (read-collections ids))
    (current [_ _id] (instance/not-yet! `instance/current))
    (write! [_ _content] (instance/not-yet! `instance/write!))
    (trash! [_ _id] (instance/not-yet! `instance/trash!))))
