(ns metabase-enterprise.library-branching.instance.rows
  "The rows of this instance that hold items, for the change lists that the sync screens show: each item by the model
  name and the row id of master's remote sync, with its collection and its table. Rows are instance-local: nothing
  here is content, and nothing is stored."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]))

(set! *warn-on-reflection* true)

(def model-names
  "The model name of master's remote sync for an item of each kind, as its change lists name it."
  {:action          "action"
   :collection      "collection"
   :dashboard       "dashboard"
   :data-app        "dataapp"
   :document        "document"
   :glossary-term   "glossary"
   :measure         "measure"
   :metric          "card"
   :model           "card"
   :published-table "table"
   :python-library  "pythonlibrary"
   :question        "card"
   :segment         "segment"
   :snippet         "nativequerysnippet"
   :timeline        "timeline"
   :transform       "transform"
   :transform-job   "transformjob"
   :transform-tag   "transformtag"
   :transform-test  "transformtest"})

(def ^:private by-entity-id
  "`{kind [model columns]}`: the kinds whose rows have the identity of the item as their entity id, with the columns
  of the row that the details read."
  {:action        [:model/Action [:collection_id]]
   :collection    [:model/Collection []]
   :dashboard     [:model/Dashboard [:collection_id]]
   :glossary-term [:model/Glossary []]
   :measure       [:model/Measure [:table_id]]
   :metric        [:model/Card [:collection_id]]
   :model         [:model/Card [:collection_id]]
   :question      [:model/Card [:collection_id]]
   :segment       [:model/Segment [:table_id]]
   :snippet       [:model/NativeQuerySnippet [:collection_id]]
   :timeline      [:model/Timeline [:collection_id]]})

(def kinds
  "The kinds whose items [[details]] finds rows for."
  (conj (set (keys by-entity-id)) :published-table))

(defn- in-batches
  [f n xs]
  (into [] (mapcat f) (partition-all n xs)))

(defn- entity-id-rows
  "`{identity row}`: the row of each identity of `ids`, all of `kind`."
  [kind ids]
  (let [[model columns] (by-entity-id kind)]
    (into {}
          (map (juxt :entity_id identity))
          (in-batches #(library-branching.db/rows-by-entity-id model columns (vec %)) 1000 ids))))

(defn- with-table-collections
  "`rows` of segments or measures, each with `:collection_id`, the collection of its table."
  [rows]
  (let [collection-of (into {}
                            (map (juxt :id :collection_id))
                            (in-batches #(library-branching.db/tables-by-id (vec %))
                                        1000
                                        (distinct (keep :table_id (vals rows)))))]
    (update-vals rows #(assoc % :collection_id (collection-of (:table_id %))))))

(defn- table-rows
  "`{table-key row}`: the table row of each natural key of `table-keys`."
  [table-keys]
  (into {}
        (map (fn [{:keys [db schema table] :as row}]
               [[db schema table] (assoc row :table_id (:id row))]))
        (in-batches #(library-branching.db/tables-by-key (vec %)) 100 table-keys)))

(defn- rows-of-kind
  [kind ids]
  (case kind
    :published-table      (table-rows ids)
    (:segment :measure)   (with-table-collections (entity-id-rows kind ids))
    :collection           (update-vals (entity-id-rows kind ids) #(assoc % :collection_id (:id %)))
    (if (contains? by-entity-id kind)
      (entity-id-rows kind ids)
      {})))

(defn details
  "`{identity {:model :model_id :collection_id :table_id}}` of each item of `items` (`[{:id :kind}]`): the model name
  of its kind ([[model-names]]), and of the row of this instance that holds its identity, in the trash or not, the
  row id, the collection that the sync screens group it under, and its table. A collection is its own collection; a
  published table is its own table, in its collection; a segment or a measure is in the collection of its table.
  Each value is nil when it does not apply, when the instance has no row of the identity, or for a kind outside
  [[kinds]]. Reads the app DB, with a constant number of queries per kind and batch of identities."
  [items]
  (into {}
        (mapcat (fn [[kind group]]
                  (let [rows (rows-of-kind kind (distinct (map :id group)))]
                    (for [{:keys [id]} group
                          :let [row (get rows id)]]
                      [id {:model         (get model-names kind)
                           :model_id      (:id row)
                           :collection_id (:collection_id row)
                           :table_id      (:table_id row)}]))))
        (group-by :kind items)))
