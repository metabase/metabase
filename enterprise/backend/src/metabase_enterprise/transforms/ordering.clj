(ns metabase-enterprise.transforms.ordering
  (:require
   [clojure.core.match]
   [clojure.set :as set]
   [flatland.ordered.set :refer [ordered-set]]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- get-output-table [transform]
  (t2/select-one-fn :id
                    :model/Table
                    :schema (get-in transform [:target :schema])
                    :name (get-in transform [:target :name])
                    :db_id (get-in transform [:source :query :database])))

(defn- transform-deps [transform]
  (let [query (-> (get-in transform [:source :query])
                  qp.preprocess/preprocess)]
    (into #{}
          (keep #(clojure.core.match/match %
                   [:source-table source] (when (int? source)
                                            source)
                   _ nil))
          (tree-seq coll? seq query))))

(defn- transform-deps-for-db [db-id transforms]
  (qp.store/with-metadata-provider db-id
    (into {}
          (map (juxt :id transform-deps))
          transforms)))

(defn transform-ordering
  "Computes an 'ordering' of a given list of transforms.

  The result is a map of transform id -> #{transform ids the transform depends on}. Dependencies are limited to just
  the transforms in the original list -- if a transform depends on some transform not in the list, the 'extra'
  dependency is ignored."
  [transforms]
  (let [transforms-by-db (->> transforms
                              (map (fn [transform]
                                     {(get-in transform [:source :query :database]) [transform]}))
                              (apply merge-with into))
        output-tables (into {}
                            (map (fn [transform]
                                   [(get-output-table transform) (:id transform)]))
                            transforms)]
    (into {}
          (map (fn [[db-id transforms-for-db]]
                 (-> (transform-deps-for-db db-id transforms-for-db)
                     (update-vals #(into #{}
                                         (keep output-tables)
                                         %)))))
          transforms-by-db)))

(defn find-cycle
  "Finds a path containing a cycle in the directed graph `node->children`."
  [node->children]
  (loop [stack (into [] (map #(vector % (ordered-set))) (keys node->children))
         visited #{}]
    (when-let [[node path] (peek stack)]
      (cond
        (contains? path node)
        (into [] (drop-while (complement #{node})) (conj path node))

        (contains? visited node)
        (recur (pop stack) visited)

        :else
        (let [path' (conj path node)
              stack' (into (pop stack)
                           (map #(vector % path'))
                           (node->children node))]
          (recur stack' (conj visited node)))))))

(defn available-transforms
  "Given an ordering (see transform-ordering), a set of running transform ids, and a set of completed transform ids,
  computes which transforms are currently able to be run."
  [ordering running complete]
  (for [[transform-id deps] ordering
        :when (and (not (or (running transform-id)
                            (complete transform-id)))
                   (empty? (set/difference deps complete)))]
    transform-id))
