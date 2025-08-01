(ns metabase.transforms.ordering
  (:require
   [clojure.set :as set]))

(defn- get-output-table [transform]
  (t2/select-one-fn :id
                    :model/Table
                    :schema (get-in transform [:target :schema])
                    :name (get-in transform [:target :name])
                    :db_id (get-in transform [:source :query :database])))

(defn- transform-deps [transform]
  (filter identity [(get-in transform [:source :query :query :source-table])]))

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
