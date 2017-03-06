(ns metabase.query-processor.middleware.annotate-and-sort
  "Middleware for annotating (adding type information to) the results of a query and sorting the columns in the results."
  (:require [metabase.driver :as driver]
            (metabase.query-processor [annotate :as annotate]
                                      [util :as qputil])))

(def ^:private ^:const ^Integer max-rows-to-scan-for-column-type-inference
  "Maximum number of rows to scan to look for a non-`nil` value to determine type information.
   This number is meant to be a good balance between not giving up prematurely and not scanning the entire set of results returned
   (which can be millions of rows in some cases)."
  100)

(defn- vals->base-type
  "Given a sequence of VALS, return the Field base type of the first non-`nil` value, scanning up to `max-rows-to-scan-for-column-type-inference` results."
  [vs]
  (or (some (fn [v]
              (when-not (nil? v)
                (driver/class->base-type (class v))))
            (take max-rows-to-scan-for-column-type-inference vs))
      :type/*))

(defn- infer-column-types
  "Infer the types of columns by looking at the first value for each in the results, and add the relevant information in `:cols`.
   This is used for native queries, which don't have the type information from the original `Field` objects used in the query, which is added to the results by `annotate`."
  [{:keys [columns rows], :as results}]
  (assoc results
    :columns (mapv name columns)
    :cols    (vec (for [i (range (count columns))]
                    {:name      (name (nth columns i))
                     :base_type (vals->base-type (for [row rows]
                                                   (nth row i)))}))))

(defn annotate-and-sort
  "Middleware for adding type information to columns returned by running a query, and sorting the columns in the results."
  [qp]
  (fn [query]
    (let [results (qp query)]
      (-> (if-not (or (qputil/mbql-query? query)
                      (:annotate? results))
            (infer-column-types results)
            (annotate/annotate-and-sort query results))
          (dissoc :annotate?)))))
