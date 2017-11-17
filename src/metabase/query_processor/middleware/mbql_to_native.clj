(ns metabase.query-processor.middleware.mbql-to-native
  "Middleware responsible for converting MBQL queries to native queries (by calling the driver's QP methods)
   so the query can then be executed."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]))

(defn- query->native-form
  "Return a `:native` query form for QUERY, converting it from MBQL if needed."
  [query]
  (u/prog1 (if-not (qputil/mbql-query? query)
             (:native query)
             (driver/mbql->native (:driver query) query))
    (when-not i/*disable-qp-logging*
      (log/debug (u/format-color 'green "NATIVE FORM: %s\n%s\n" (u/emoji "😳") (u/pprint-to-str <>))))))

(defn mbql->native
  "Middleware that handles conversion of MBQL queries to native (by calling driver QP methods) so the queries
   can be executed. For queries that are already native, this function is effectively a no-op."
  [qp]
  (fn [query]
    (let [native-form  (query->native-form query)
          native-query (if-not (qputil/mbql-query? query)
                         query
                         (assoc query :native native-form))
          results      (qp native-query)]
      (assoc results :native_form native-form))))
