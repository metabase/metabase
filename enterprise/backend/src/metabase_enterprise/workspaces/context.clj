(ns metabase-enterprise.workspaces.context
  (:require
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- fetch-entities [type model-select ids]
  (if (empty? ids)
    {}
    (let [id->entity (t2/select-fn->fn :id identity model-select :id [:in ids])]
      (when (not= (count ids) (count id->entity))
        (throw (ex-info (tru "Unable to find all graph entities in the appdb")
                        {:status-code   500
                         :type          type
                         :ids           ids
                         :transform-ids (remove id->entity ids)})))
      id->entity)))

(defn- fetch-transforms [transform-ids]
  (fetch-entities "transform" :model/Transform transform-ids))

(defn- fetch-tables [table-ids]
  (fetch-entities "table" [:model/Table :id :db_id :schema :name] table-ids))

;;;; Misc

(defn transform-node->data
  "TODO (lbrdnk): Add docstring."
  [ctx transform-node]
  ;; TODO: :var
  (get-in ctx [:data :id->transform (:id transform-node)]))

(defn direct-dependencies
  "Get direct dependencies of a node"
  [ctx node]
  (get-in ctx [:graph :dependencies node]))

(defn has-dependencies?
  "TODO (lbrdnk): Add docstring."
  [ctx node]
  (boolean (seq (direct-dependencies ctx node))))

(defn- transform-node->remapped-target-rf
  [ctx acc transform-dep-node]
  (let [transform-data (transform-node->data ctx transform-dep-node)
        {:keys [schema name]} (:target transform-data)
        k [schema name]
        v (get-in ctx [:src-schema+table->dst->schema+table k])]
    (assoc acc k v)))

(defn transform-node->src->dst-remapping
  "TODO (lbrdnk): Add docstring."
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

(defn transform-node->py-tables-remaps
  "Remaps for python transform node"
  [ctx transform-node]
  (let [{:keys [source]} (transform-node->data ctx transform-node)
        all-mappings (:src-output-id->dst-output ctx)
        transform-table-ids (-> source :source-tables vals set)]
    (into {}
          (keep (fn [src-id]
                  (when-some [dst-id (get-in all-mappings [src-id :id])]
                    [src-id dst-id])))
          transform-table-ids)))
