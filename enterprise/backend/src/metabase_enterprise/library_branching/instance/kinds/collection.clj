(ns metabase-enterprise.library-branching.instance.kinds.collection
  "The app DB side of the kind `:collection`, in the item form of `format.kinds.collection`. Not content: the slug
  (from the name), the archive columns (scope), `is_sample`, `is_remote_synced` and the bookkeeping columns."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.collection :as format.collection]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.collections.core :as collections]
   [metabase.models.serialization :as serdes]
   [metabase.request.core :as request]))

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

(defn- root?
  "True iff an item with the attributes `attrs` may be at the root level: a fixed root of scope."
  [{:keys [type namespace]}]
  (or (contains? (:collection-types scope/roots) type)
      (contains? (:namespaces scope/roots) (some-> namespace keyword))))

(defn current-collection
  "The state of collection `id` (`instance/current`), after a lock on its row."
  [id]
  (let [row (library-branching.db/lock-collection id)]
    (content/current-state (boolean (and row (tree/collection-in-tree? row)))
                           #(scope/in-scope? :collection id)
                           #(get (read-collections [id]) id))))

(defn- columns
  "The collection columns of the attributes `ks` of `attrs`, an absent one at its default."
  [attrs ks]
  (into {} (map (fn [k] [k (content/attr-value format.collection/spec attrs k)])) ks))

(defn write-collection!
  "Makes the content of collection `id` equal to `item`, by the contract of `instance/write!`. A move also moves the
  subtree."
  [id {:keys [name place attrs] :as item}]
  (content/check-item! :collection id item)
  (let [row      (library-branching.db/lock-collection id)
        _        (when row (tree/check-in-tree! id (tree/collection-in-tree? row)))
        parent   (tree/place-collection id place)
        _        (when (and (nil? place) (not (root? attrs)))
                   (instance/refuse! :place id "Only a fixed root of the Library is at the root level."))
        location (tree/children-location parent)]
    (if-not row
      (library-branching.db/insert-collection!
       (merge {:entity_id id :name name :location location}
              (columns attrs (keys (:attrs format.collection/spec)))))
      (let [old     (get (read-collections [id]) id)
            changes (cond-> (columns attrs (content/changed-attrs format.collection/spec (:attrs old) attrs))
                      (not= name (:name old))         (assoc :name name)
                      (not= location (:location row)) (assoc :location location)
                      (:archived row)                 (assoc :archived false
                                                             :archived_directly nil
                                                             :archive_operation_id nil))]
        (when (some #{(:id row)} (tree/ancestor-ids location))
          (instance/refuse! :place id "A collection cannot be inside itself."))
        (when (seq changes)
          (library-branching.db/update-collection! (:id row) changes))
        (when (contains? changes :location)
          (library-branching.db/move-descendant-collections! (tree/children-location row)
                                                             (tree/children-location (assoc row :location location))))))
    nil))

(defn trash-collection!
  "Moves collection `id` to the trash with its subtree and the items in them, as the Trash of Metabase does."
  [id]
  (when (contains? snapshot/system-ids id)
    (instance/refuse! :system-item id "A system item of the Library cannot go to the trash."))
  (when-let [row (library-branching.db/lock-collection id)]
    (tree/check-in-tree! id (tree/collection-in-tree? row))
    (when-not (:archived row)
      (request/as-admin
        (collections/archive-or-unarchive-collection! (library-branching.db/select-collection (:id row))
                                                      {:archived true})))
    nil))

(def kind-store
  "The `KindStore` of collections."
  (reify instance/KindStore
    (read-all [_ ids] (read-collections ids))
    (current [_ id] (current-collection id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-collection! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-collection! id)))))
