(ns metabase.query-processor.middleware.annotate-and-sort
  "Middleware for annotating (adding type information to) the results of a query and sorting the columns in the results."
  (:require [metabase.driver :as driver]
            (metabase.query-processor [annotate :as annotate]
                                      [util :as qputil])))

(defn- infer-column-types
  "Infer the types of columns by looking at the first value for each in the results, and add the relevant information in `:cols`.
   This is used for native queries, which don't have the type information from the original `Field` objects used in the query, which is added to the results by `annotate`."
  [results]
  (assoc results
    :columns (mapv name (:columns results))
    :cols    (vec (for [[column first-value] (partition 2 (interleave (:columns results) (first (:rows results))))]
                    {:name      (name column)
                     :base_type (driver/class->base-type (type first-value))}))))

(defn annotate-and-sort
  "Middleware for adding type information to columns returned by running a query, and sorting the columns in the results."
  [qp]
  (fn [query]
    (let [results (qp query)]
      (if-not (or (qputil/mbql-query? query)
                  (:annotate? results))
        (infer-column-types results)
        (annotate/annotate-and-sort query results)))))
