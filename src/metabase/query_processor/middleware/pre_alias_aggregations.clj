(ns metabase.query-processor.middleware.pre-alias-aggregations
  (:require
   [metabase.driver :as driver]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.query-processor.middleware.annotate :as annotate]))

(defn- ag-name [inner-query ag-clause]
  (driver/escape-alias driver/*driver* (annotate/aggregation-name inner-query ag-clause)))

(defn- pre-alias-and-uniquify [inner-query aggregations]
  (mapv
   (fn [original-ag updated-ag]
     (if (= original-ag updated-ag)
       original-ag
       (with-meta updated-ag {:auto-generated? true})))
   aggregations
   (mbql.u/pre-alias-and-uniquify-aggregations (partial ag-name inner-query) aggregations)))

(defn pre-alias-aggregations-in-inner-query
  "Make sure all aggregations have aliases, and all aliases are unique, in an 'inner' MBQL query."
  [{:keys [aggregation source-query joins], :as inner-query}]
  (cond-> inner-query
    (seq aggregation)
    (update :aggregation (partial pre-alias-and-uniquify inner-query))

    source-query
    (update :source-query pre-alias-aggregations-in-inner-query)

    joins
    (update :joins (partial mapv pre-alias-aggregations-in-inner-query))))

(defn pre-alias-aggregations
  "Middleware that generates aliases for all aggregations anywhere in a query, and makes sure they're unique."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (update query :query pre-alias-aggregations-in-inner-query)))
