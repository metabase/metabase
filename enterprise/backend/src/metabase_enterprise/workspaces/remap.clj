(ns metabase-enterprise.workspaces.remap
  (:require
   [macaw.core :as macaw]
   [metabase-enterprise.workspaces.context :as ws.ctx]))

;;;; Transform source remapping

(defn- remapped-transform-source-dispatch
  [transform-node graph]
  (let [{source-type :source_type} (ws.ctx/transform-node->data graph transform-node)]
    source-type))

(defmulti remapped-transform-source
  "todo"
  {:added "0.59.0" :arglists '([transform-node graph])}
  #'remapped-transform-source-dispatch)

;;;; Transform native source remaping impl.

(defn- mappings-for-macaw-rf
  [acc [[src-schema src-table]
        [dst-schema dst-table]]]
  (assert (or (not (contains? (:schemas acc) src-schema))
              (= dst-schema (get-in acc [:schemas src-schema])))
          "Mapping mismatch")
  (-> acc
      (assoc-in [:schemas src-schema] dst-schema)
      (assoc-in [:tables {:schema src-schema :table src-table}] dst-table)))

(defn- macaw-renames
  [src-schema+table->dst-schema+table]
  (reduce mappings-for-macaw-rf
          {}
          src-schema+table->dst-schema+table))

(defn- native-mappings
  [transform-node ctx]
  (ws.ctx/transform-node->src->dst-remapping ctx transform-node)
  ;; for when :dependencies hold table-nodes, now we go with transform nodes
  #_(ws.ctx/schema+table->schema+table-outputs-remapping ctx transform-node))

(defn- remap-sql-tables
  [sql-str macaw-mappings]
  (macaw/replace-names sql-str macaw-mappings))

(def ^:private query-sql-path
  [:query :stages 0 :native])

(defmethod remapped-transform-source :native
  [transform-node ctx]
  (let [mappings (native-mappings transform-node ctx)
        renames (macaw-renames mappings)
        transform-data (ws.ctx/transform-node->data ctx transform-node)
        {:keys [source]} transform-data
        native-str (get-in source query-sql-path)
        remapped-str (remap-sql-tables native-str renames)]
    (assoc-in source query-sql-path remapped-str)))

;;;; Python

(defmethod remapped-transform-source :python
  [transform-node ctx]
  (let [{:keys [source]} (ws.ctx/transform-node->data ctx transform-node)
        remaps (ws.ctx/transform-node->py-tables-remaps ctx transform-node)
        val-remapper (fn [id] (get remaps id id))]
    (update source :source-tables update-vals val-remapper)))

;;;; Public

(defn- source-for-mirrored-transform
  [transform-node ctx]
  (let [transform-data (ws.ctx/transform-node->data ctx transform-node)
        {source :source} transform-data]
    (if-not (ws.ctx/has-dependencies? ctx transform-node)
      source
      (remapped-transform-source transform-node ctx))))

(defn target-for-mirrored-transform
  "This should happen to every transform"
  [transform-node ctx]
  (let [data (ws.ctx/transform-node->data ctx transform-node)
        target (:target data)
        [dst-schema dst-table] (get (:src-schema+table->dst->schema+table ctx)
                                    [(:schema target) (:name target)])]
    (-> target
        (assoc :schema dst-schema)
        (assoc :name dst-table))))

(defn remap-for-transform
  "Return _transform data_ to be used to create transform duplicate."
  [transform-node ctx]
  (let [dst-target (target-for-mirrored-transform transform-node ctx)
        dst-source (source-for-mirrored-transform transform-node ctx)]
    {:target dst-target
     :source dst-source}))
