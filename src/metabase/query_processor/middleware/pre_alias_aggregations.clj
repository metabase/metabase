(ns metabase.query-processor.middleware.pre-alias-aggregations
  (:require [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.middleware.annotate :as annotate]))

(defn- ag-name [ag-clause]
  (driver/format-custom-field-name driver/*driver* (annotate/aggregation-name ag-clause)))

(defn- pre-alias-and-uniquify [aggregations]
  (mapv
   (fn [original-ag updated-ag]
     (if (= original-ag updated-ag)
       original-ag
       (with-meta updated-ag {:auto-generated? true})))
   aggregations
   (mbql.u/pre-alias-and-uniquify-aggregations ag-name aggregations)))

(defn pre-alias-aggregations-in-inner-query
  "Make sure all aggregations have aliases, and all aliases are unique, in an 'inner' MBQL query."
  [{:keys [aggregation source-query joins], :as inner-query}]
  (cond-> inner-query
    (seq aggregation)
    (update :aggregation pre-alias-and-uniquify)

    source-query
    (update :source-query pre-alias-aggregations-in-inner-query)

    joins
    (update :joins (partial mapv pre-alias-aggregations-in-inner-query))))

(defn- maybe-pre-alias-aggregations [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (update query :query pre-alias-aggregations-in-inner-query)))

(defn pre-alias-aggregations
  "Middleware that generates aliases for all aggregations anywhere in a query, and makes sure they're unique."
  [qp]
  (fn [query rff context]
    (qp (maybe-pre-alias-aggregations query) rff context)))
