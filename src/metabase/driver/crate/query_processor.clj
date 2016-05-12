(ns metabase.driver.crate.query-processor
  (:require [korma.core :as k]
            (korma.sql [engine :as kengine]
                       [fns :as kfns])
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.query-processor.interface :as i])
  (:import (metabase.query_processor.interface ComparisonFilter CompoundFilter)))

(defn- rewrite-between
  "Rewrite [:between <field> <min> <max>] -> [:and [:>= <field> <min>] [:<= <field> <max>]]"
  [clause]
  (i/strict-map->CompoundFilter {:compound-type :and
                                 :subclauses    [(i/strict-map->ComparisonFilter {:filter-type :>=
                                                                                  :field       (:field clause)
                                                                                  :value       (:min-val clause)})
                                                 (i/strict-map->ComparisonFilter {:filter-type :<=
                                                                                  :field       (:field clause)
                                                                                  :value       (:max-val clause)})]}))

(defn resolve-subclauses
  "resolve filters recursively"
  [clause]
  (if (= (count (:subclauses clause)) 0)
    (case (:filter-type clause)
           :between (qp/filter-clause->predicate (rewrite-between clause))
           (qp/filter-clause->predicate clause))
    (case (:compound-type clause)
      :and (apply kfns/pred-and (map resolve-subclauses (:subclauses clause)))
      :or  (apply kfns/pred-or  (map resolve-subclauses (:subclauses clause)))
      :not (kfns/pred-not (kengine/pred-map (qp/filter-subclause->predicate clause))))))

(defn apply-filter
  "Apply custom generic SQL filter. This is the place to perform query rewrites."
  [_ korma-form {clause :filter}]
  (k/where korma-form (resolve-subclauses clause)))
