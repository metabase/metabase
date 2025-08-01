(ns metabase-enterprise.transforms.ordering
  (:require
   [clojure.core.match :as match]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.lib.util.match :as lib.util.match]
   [toucan2.core :as t2]))

(defn- get-output-table [transform]
  (t2/select-one-fn :id
                    :model/Table
                    :schema (get-in transform [:target :schema])
                    :name (get-in transform [:target :name])
                    :db_id (get-in transform [:source :query :database])))

(defn- card-id [card-ref]
  (->> (str/split card-ref #"_")
       last
       Integer/parseInt))

(defn- query-deps [query]
  (->> (tree-seq coll? seq query)
       (map #(match/match %
               [:source-table source] (if (string? source)
                                        {:cards #{(card-id source)}}
                                        {:tables #{source}})
               _ {}))
       (apply merge-with set/union)))

(defn- transform-deps [transform]
  (loop [[t & transforms] [(get-in transform [:source :query])]
         results {}
         seen #{}]
    (if t
      (let [{:keys [tables cards]} (query-deps t)]
        (recur (concat (->> (for [card cards
                                  :when (not (seen card))]
                              (t2/select-one-fn :dataset_query :model/Card :id card)))
                       transforms)
               tables
               (apply conj seen cards)))
      results)))

(defn transform-ordering
  "Computes an 'ordering' of a given list of transforms.

  The result is a map of transform id -> #{transform ids the transform depends on}. Dependencies are limited to just
  the transforms in the original list -- if a transform depends on some transform not in the list, the 'extra'
  dependency is ignored."
  [transforms]
  (let [output-tables (into {}
                            (map (fn [transform]
                                   [(get-output-table transform) (:id transform)]))
                            transforms)]
    (into {}
          (map (fn [transform]
                 [(:id transform) (into #{}
                                        (keep output-tables)
                                        (transform-deps transform))]))
          transforms)))

(defn get-available-transforms
  "Given an ordering (see transform-ordering), a set of running transform ids, and a set of completed transform ids,
  computes which transforms are currently able to be run."
  [ordering running complete]
  (for [[transform-id deps] ordering
        :when (and (not (or (running transform-id)
                            (complete transform-id)))
                   (empty? (set/difference deps complete)))]
    transform-id))
