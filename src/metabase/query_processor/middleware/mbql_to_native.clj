(ns metabase.query-processor.middleware.mbql-to-native
  "Middleware responsible for converting MBQL queries to native queries (by calling the driver's QP methods)
   so the query can then be executed."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.query-processor.interface :as i]
            [metabase.util.i18n :refer [tru]]))

(defn- query->native-form
  "Return a `:native` query form for QUERY, converting it from MBQL if needed."
  [{query-type :type, :as query}]
  (u/prog1 (if-not (= :query query-type)
             (:native query)
             (try (driver/mbql->native (:driver query) query)
                  (catch Throwable e
                    (log/error (tru "Error transforming MBQL query to native:") "\n" (u/pprint-to-str query))
                    (throw e))))
    (when-not i/*disable-qp-logging*
      (log/debug (u/format-color 'green "NATIVE FORM: %s\n%s\n" (u/emoji "😳") (u/pprint-to-str <>))))))

(defn mbql->native
  "Middleware that handles conversion of MBQL queries to native (by calling driver QP methods) so the queries
   can be executed. For queries that are already native, this function is effectively a no-op."
  [qp]
  (fn [{query-type :type, {:keys [disable-mbql->native?]} :middleware, :as query}]
    ;; disabling mbql->native is only used by the `qp/query->preprocessed` function so we can get the fully
    ;; pre-processed query *before* we convert it to native, which might fail for one reason or another
    (if disable-mbql->native?
      (qp query)
      (let [native-form  (query->native-form query)
            native-query (if-not (= query-type :query)
                           query
                           (assoc query :native native-form))
            results      (qp native-query)]
        (assoc results :native_form native-form)))))
