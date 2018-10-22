(ns metabase.query-processor.middleware.annotate-and-sort
  "Middleware for annotating (adding type information to) the results of a query and sorting the columns in the results."
  (:require [metabase.driver :as driver]
            [metabase.models.humanization :as humanization]
            [metabase.query-processor.annotate :as annotate]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            NATIVE QUERY ANNOTATION                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- infer-column-types
  "Infer the types of columns by looking at the first value for each in the results, and add the relevant information in
  `:cols`. This is used for native queries, which don't have the type information from the original `Field` objects
  used in the query, which is added to the results by `annotate`."
  [{:keys [columns rows], :as results}]
  (assoc results
    :columns (mapv name columns)
    :cols    (vec (for [i    (range (count columns))
                        :let [col (nth columns i)]]
                    {:name         (name col)
                     :display_name (humanization/name->human-readable-name (name col))
                     :base_type    (or (driver/values->base-type (for [row rows]
                                                                   (nth row i)))
                                       :type/*)}))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               GENERAL MIDDLEWARE                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn annotate-and-sort
  "Middleware for adding type information to columns returned by running a query, and sorting the columns in the results."
  [qp]
  (fn [{query-type :type, :as query}]
    (let [results (qp query)]
      (-> (if-not (or (= query-type :query)
                      (:annotate? results))
            (infer-column-types results)
            (annotate/annotate-and-sort query results))
          (dissoc :annotate?)))))
