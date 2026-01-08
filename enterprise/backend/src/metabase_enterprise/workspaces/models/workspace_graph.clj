(ns metabase-enterprise.workspaces.models.workspace-graph
  "Model for cached workspace dependency graphs."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceGraph [_model] :workspace_graph)

;; The graph structure contains :dependencies with map keys that need special handling.
;; We use a custom transform that converts map keys to/from association lists.

(defn- graph-out
  "Transform graph from DB (JSON string) to Clojure data.
   Converts :dependencies association list back to a map with proper keys."
  [graph-json]
  (when graph-json
    (let [graph (mi/json-out-with-keywordization graph-json)]
      (-> graph
          (update :dependencies (fn [assoc-list]
                                  (into {} (map (fn [[k vs]]
                                                  [(update k :node-type keyword)
                                                   (mapv #(update % :node-type keyword) vs)])
                                                assoc-list))))
          (update :entities (fn [entities]
                              (mapv #(update % :node-type keyword) entities)))
          (update :inputs #(or % []))
          (update :outputs #(or % []))))))

(defn- graph-in
  "Transform graph from Clojure data to DB (JSON string).
   Converts :dependencies map to association list since JSON can't have map keys."
  [graph]
  (when graph
    (-> graph
        (update :dependencies (fn [deps]
                                (mapv (fn [[k vs]]
                                        [(select-keys k [:node-type :id])
                                         (mapv #(select-keys % [:node-type :id]) vs)])
                                      deps)))
        (update :entities (fn [entities]
                            (mapv #(select-keys % [:node-type :id]) entities)))
        mi/json-in)))

(t2/deftransforms :model/WorkspaceGraph
  {:graph {:in graph-in :out graph-out}})

(doto :model/WorkspaceGraph
  (derive :metabase/model)
  (derive :hook/timestamped?))
