(ns metabase.driver.crate.query-processor
  (:require [korma.core :as k]
            [korma.sql.engine :as kengine]
            [korma.sql.fns :as kfns]
            [metabase.driver.generic-sql.query-processor :as qp]))

(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`."
  [{:keys [filter-type field value], :as filter}]
  {:pre [(map? filter) field]}
  (let [field (qp/formatted field)]
    {field (case filter-type
             ;; TODO: implement Crate equivalent for "BETWEEN"
             :between ['between [(qp/formatted (:min-val filter)) (qp/formatted (:max-val filter))]]
             :starts-with ['like (qp/formatted (update value :value (fn [s] (str s \%))))]
             :contains ['like (qp/formatted (update value :value (fn [s] (str \% s \%))))]
             :ends-with ['like (qp/formatted (update value :value (fn [s] (str \% s))))]
             :> ['> (qp/formatted value)]
             :< ['< (qp/formatted value)]
             :>= ['>= (qp/formatted value)]
             :<= ['<= (qp/formatted value)]
             := ['= (qp/formatted value)]
             :!= ['not= (qp/formatted value)])}))

(defn- filter-clause->predicate [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply kfns/pred-and (map filter-clause->predicate subclauses))
    :or  (apply kfns/pred-or (map filter-clause->predicate subclauses))
    :not (kfns/pred-not (kengine/pred-map (filter-subclause->predicate subclause)))
    nil  (filter-subclause->predicate clause)))

(defn apply-filter
  "Apply custom generic SQL filter"
  [_ korma-form {clause :filter}]
  (k/where korma-form (filter-clause->predicate clause)))
