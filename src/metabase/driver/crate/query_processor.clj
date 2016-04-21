(ns metabase.driver.crate.query-processor
  (:require [korma.core :as k]
            [metabase.driver.generic-sql.query-processor :as qp])
  (:import (metabase.driver.query_processor.interface CompoundFilter ComparisonFilter)))


(defn- rewrite-between
  "Rewrite [:between <field> <min> <max>] -> [:and [:>= <field> <min>] [:<= <field> <max>]]"
  [clause]
  (CompoundFilter. :and [(ComparisonFilter. :>= (:field clause) (:min-val clause))
                         (ComparisonFilter. :<= (:field clause) (:max-val clause))]))

(defn apply-filter
  "Apply custom generic SQL filter. This is the place to perform query rewrites."
  [_ korma-form {clause :filter}]
  (k/where korma-form (case (:filter-type clause)
            :between (qp/filter-clause->predicate (rewrite-between clause))
            (qp/filter-clause->predicate clause))))
