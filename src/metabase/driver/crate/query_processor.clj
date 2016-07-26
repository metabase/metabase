(ns metabase.driver.crate.query-processor
  (:require [honeysql.helpers :as h]
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.query-processor.interface :as i]))

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

(defn- filter-clause->predicate
  "resolve filters recursively"
  [{:keys [compound-type filter-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply vector :and (map filter-clause->predicate subclauses))
    :or  (apply vector :or  (map filter-clause->predicate subclauses))
    :not [:not (filter-clause->predicate subclause)]
    nil  (qp/filter-clause->predicate (if (= filter-type :between)
                                        (rewrite-between clause)
                                        clause))))

(defn apply-filter
  "Apply custom generic SQL filter. This is the place to perform query rewrites."
  [_ honeysql-form {clause :filter}]
  (h/where honeysql-form (filter-clause->predicate clause)))
