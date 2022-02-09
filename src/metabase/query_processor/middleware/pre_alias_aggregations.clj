(ns metabase.query-processor.middleware.pre-alias-aggregations
  (:require [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.middleware.annotate :as annotate]))

(defn- ag-name [ag-clause]
  (driver/escape-alias driver/*driver* (annotate/aggregation-name ag-clause)))

(defn- pre-alias-and-uniquify [aggregations]
  (mapv
   (fn [original-ag updated-ag]
     (if (= original-ag updated-ag)
       original-ag
       (with-meta updated-ag {:auto-generated? true})))
   aggregations
   (mbql.u/pre-alias-and-uniquify-aggregations ag-name aggregations)))

(defn pre-alias-aggregations-in-query
  "Make sure all aggregations have aliases, and all aliases are unique, in an 'inner' MBQL query."
  [{:keys [aggregation], :as query}]
  (cond-> query
    (seq aggregation) (update :aggregation pre-alias-and-uniquify)))

(defn pre-alias-aggregations
  "Middleware that generates aliases for all aggregations anywhere in a query, and makes sure they're unique."
  [{:qp/keys [query-type], :as query}]
  (cond-> query
    (= query-type :mbql) pre-alias-aggregations-in-query))
