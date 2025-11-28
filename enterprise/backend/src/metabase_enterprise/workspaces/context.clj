(ns metabase-enterprise.workspaces.context

  (:require
   [toucan2.core :as t2]))

;; TODO (lbrdnk 2025-11-26): Following should have its own module
;;;; Fetching the graph data

(defn- fetch-graph-transforms
  [transform-ids]
  (if (empty? transform-ids)
    {}
    (let [id->transform (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids])]
      (assert (= (count id->transform) (count id->transform)))
      id->transform)))

(defn- fetch-graph-tables
  [table-ids]
  (when (seq table-ids)
    (let [id->table (into {}
                          (t2/select-fn->fn :id identity [:model/Table :id :schema :name]
                                            :id [:in table-ids]))]
      (assert (= (count table-ids) (count id->table)))
      id->table)))

(defn- fetch-graph-resources
  [graph]
  ;; TODO: keep -> map when we have guards ensuring outputs have id?
  ;;       figure out the details
  {:id->output-table (fetch-graph-tables (keep :id (:outputs graph)))
   :id->input-table (fetch-graph-tables (keep :id (:inputs graph)))
   :id->transform (fetch-graph-transforms (map :id (:transforms graph)))})

;;;; Public

(defn ->context-with-resources
  [graph]
  {:data (fetch-graph-resources graph)
   :graph graph})

;;;; Misc

(defn transform-node->data
  [ctx transform-node]
  ;; TODO: :var
  (get-in ctx [:data :id->transform (:id transform-node)]))

(defn direct-dependencies
  "Get direct dependencies of a node"
  [ctx node]
  (get-in ctx [:graph :dependencies node]))

(defn has-dependencies?
  [ctx node]
  (boolean (seq (direct-dependencies ctx node))))

(defn transform-node->remapped-target-rf
  [ctx acc transform-dep-node]
  (let [transform-data (transform-node->data ctx transform-dep-node)
        {:keys [schema name]} (:target transform-data)
        k [schema name]
        v (get-in ctx [:src-schema+table->dst->schema+table k])]
    (assoc acc k v)))

(defn transform-node->src->dst-remapping
  [ctx transform-node]
  (let [transform-deps-nodes (direct-dependencies ctx transform-node)]
    (assert (every? (comp #{:transform} :type) transform-deps-nodes))
    (reduce
     (partial transform-node->remapped-target-rf ctx)
     {}
     transform-deps-nodes)))

;; for when :dependencies hold table-nodes, now we go with transform nodes
#_(defn schema+table->schema+table-outputs-remapping
    [ctx transform-node]
    (not-empty
     (let [deps (direct-dependencies ctx transform-node)
           deps-ids (map :id deps)
           src-output-id->dst-output (:src-output-id->dst-output ctx)
           src-id->schema+table (-> (get-in ctx [:data :id->output-table])
                                    (update-vals (juxt :schema :name)))]
       (-> (select-keys src-output-id->dst-output deps-ids)
           (update-keys src-id->schema+table)
           (update-vals (juxt :schema :name))))))
