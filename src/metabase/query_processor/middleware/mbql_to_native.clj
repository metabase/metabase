(ns metabase.query-processor.middleware.mbql-to-native
  "Middleware responsible for converting MBQL queries to native queries (by calling the driver's QP methods)
   so the query can then be executed."
  (:require
   [metabase.driver :as driver]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn query->native-form
  "Return a `:native` query form for `query`, converting it from MBQL if needed."
  [{query-type :type, :as query}]
  (if-not (= :query query-type)
    (:native query)
    (driver/mbql->native driver/*driver* query)))

(defn mbql->native
  "Middleware that handles conversion of MBQL queries to native (by calling driver QP methods) so the queries
   can be executed. For queries that are already native, this function is effectively a no-op."
  [qp]
  (fn [query rff context]
    (let [native-query (query->native-form query)]
      (log/trace (u/format-color 'yellow "\nPreprocessed:\n%s" (u/pprint-to-str query)))
      (log/trace (u/format-color 'green "Native form: \n%s" (u/pprint-to-str native-query)))
      (qp
       (assoc query :native native-query)
       (fn [metadata]
         (rff (assoc metadata :native_form native-query)))
       context))))
