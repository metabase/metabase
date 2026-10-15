(ns metabase-enterprise.library-branching.instance.kinds.table-item
  "The app DB side of the kinds whose rows live on a warehouse table (`:segment`, `:measure`), in the item form of
  `format.kinds.table-item`. The place is the table key of the row's table. The attribute `:definition` is the
  portable form of the `definition` column; the other attributes are the columns of the same names. Not content: the
  archive column (scope), `table_id` (the place) and the bookkeeping columns.

  A table item is in the Library tree iff its table is published into a collection of the Library tree. A table that
  leaves scope takes its table items with it, so a trash of a published table or of a collection also moves the
  table items that leave scope to the trash ([[do-keeping-archive-closed]])."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

;; A table item kind: {:kind :segment, :model :model/Segment, :serdes "Segment", :spec format-spec}

(defn- transforms
  [{serdes-model :serdes}]
  (:transform (serdes/make-spec serdes-model {})))

(defn- export-fns
  "`{attribute export-fn}` of the attributes whose column the serdes spec of the kind's model exports with a transform."
  [{:keys [spec] :as k}]
  (let [ts (transforms k)]
    (into {}
          (keep (fn [a] (when-let [f (get-in ts [a :export])] [a f])))
          (keys (:attrs spec)))))

(defn- import-fns
  "`{attribute import-fn}`: the inverses of [[export-fns]]."
  [{:keys [spec] :as k}]
  (let [ts (transforms k)]
    (into {}
          (keep (fn [a] (when-let [f (get-in ts [a :import])] [a f])))
          (keys (:attrs spec)))))

(defn attrs
  "The attributes of `row` of the table item kind `k`, with none at its default. `exports` is the kind's exports."
  [{:keys [spec]} exports row]
  (->> (keys (:attrs spec))
       (map (fn [a] [a ((get exports a identity) (get row a))]))
       (into {})
       portable/document
       (content/attrs spec)))

(defn read-items
  "`{entity-id item}` of the items of the table item kind `k` with the identities `entity-ids`."
  [{:keys [kind model] :as k} entity-ids]
  (let [rows     (content/in-chunks (partial library-branching.db/table-items-by-entity-id model) (vec entity-ids))
        exports  (export-fns k)
        contents (portable/export-batch (fn [row]
                                          {:place (serdes/*export-table-fk* (:table_id row))
                                           :attrs (attrs k exports row)})
                                        rows)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item kind entity_id name place attrs)])
               rows
               contents))))

(defn table-in-tree?
  "True iff the table `table-id` is published into a collection of the Library tree, trashed or not."
  [table-id]
  (let [{:keys [is_published collection_id]} (first (library-branching.db/tables-by-id [table-id]))]
    (boolean (and is_published (tree/collection-id-in-tree? collection_id)))))

(defn current-item
  "The content of the in-scope item `id` of the table item kind `k`, after a lock on its row, or nil."
  [{:keys [kind model] :as k} id]
  (library-branching.db/lock-table-item model id)
  (when (scope/in-scope? kind id)
    (get (read-items k [id]) id)))

(defn- place-table!
  "Throws ::instance/refused for item `id` unless `place` is the table key of an in-scope published table."
  [id place]
  (when-not (some #(= place [(:db %) (:schema %) (:table %)]) (library-branching.db/tables-by-key [place]))
    (instance/refuse! :environment id "This instance has no table with the natural key of the place."
                      {:place place}))
  (when-not (scope/in-scope? :published-table place)
    (instance/refuse! :place id "The table of the item is not a published table of the Library on this instance."
                      {:place place})))

(defn- columns
  "The columns of the attributes `ks` of `attrs`, an absent one at its default, through the imports `imports`."
  [{:keys [spec]} imports attrs ks]
  (into {}
        (map (fn [a]
               (let [v (content/attr-value spec attrs a)]
                 [a (if (some? v) ((get imports a identity) v) v)])))
        ks))

(defn write-item!
  "Makes the content of item `id` of the table item kind `k` equal to `item`, by the contract of `instance/write!`.
  Metabase derives the row's table from its definition, which is on the table of the place."
  [{:keys [kind model spec] :as k} id {:keys [name place attrs] :as item}]
  (content/check-item! kind id item)
  (let [row     (library-branching.db/lock-table-item model id)
        _       (when row (tree/check-in-tree! id (table-in-tree? (:table_id row))))
        _       (place-table! id place)
        imports (import-fns k)]
    (if-not row
      (library-branching.db/insert-table-item!
       model
       (merge {:entity_id  id
               :name       name
               :creator_id (or api/*current-user-id* config/internal-mb-user-id)}
              (columns k imports attrs (keys (:attrs spec)))))
      (let [old     (get (read-items k [id]) id)
            changes (cond-> (columns k imports attrs (content/changed-attrs spec (:attrs old) attrs))
                      (not= name (:name old)) (assoc :name name)
                      (:archived row)         (assoc :archived false))]
        (when (seq changes)
          (library-branching.db/update-table-item! model (:id row) changes))))
    nil))

(defn trash-item!
  "Moves item `id` of the table item kind `k` to the trash."
  [{:keys [model]} id]
  (when-let [row (library-branching.db/lock-table-item model id)]
    (when-not (:archived row)
      (tree/check-in-tree! id (table-in-tree? (:table_id row)))
      (library-branching.db/update-table-item! model (:id row) {:archived true}))
    nil))

(def ^:private models
  {:segment :model/Segment
   :measure :model/Measure})

(defn do-keeping-archive-closed
  "Calls `f` with no arguments and returns its result; then moves to the trash each segment and measure that left
  scope during the call. So archive stays closed downward: a later restore of their table brings back none of them,
  and a write restores each."
  [f]
  (let [before (scope/scope-ids scope/roots (keys models))
        result (f)
        after  (scope/scope-ids scope/roots (keys models))]
    (doseq [[kind model] (sort-by key models)
            :let [gone (set/difference (get before kind) (get after kind))]
            :when (seq gone)]
      (run! #(library-branching.db/archive-table-items! model (vec %)) (partition-all content/chunk-size (sort gone))))
    result))

(defn kind-store
  "The `KindStore` of the table item kind `k`."
  [k]
  (reify instance/KindStore
    (read-all [_ ids] (read-items k ids))
    (current [_ id] (current-item k id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-item! k id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-item! k id)))))
