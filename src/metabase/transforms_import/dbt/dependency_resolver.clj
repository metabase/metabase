(ns metabase.transforms-import.dbt.dependency-resolver
  "Resolve the execution order of dbt models using topological sort."
  (:require
    [medley.core :as m]))

(defn build-graph [project]
  "Build dependency graph from project models."
  #_(println "NAMES" (map :name (vals (:id->model project))))
  (let [name->model (m/index-by :name (vals (:id->model project)))
        graph       (into {} (for [model (vals (:id->model project))]
                               (do #_(println "MODEL" model)
                                 (when-not (or (get-in model [:config :is_seed])
                                               (get-in model [:config :is_snapshot]))
                                   [(:name model) (set (filter (partial contains? name->model)
                                                               (:depends-on-models model)))]))))]
    graph))

(defn topological-sort
  "Sorts the vertices of a directed acyclic graph by number of dependencies, leaves first.

  `graph` is a map from head vertices to the set of tail vertices. E.g., `{:a #{:b :c} :b #{:d}}`."
  [graph]
  (let [depth (fn depth [head]
                (let [tails (get graph head)]
                  (if (empty? tails)
                    0
                    (inc (apply max (map depth tails))))))]
    (map val (sort-by key (group-by depth (keys graph))))))
