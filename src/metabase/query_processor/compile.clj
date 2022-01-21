(ns metabase.query-processor.compile
  "Logic for compiling a preprocessed MBQL query to a native query."
  (:refer-clojure :exclude [compile])
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.query-processor.preprocess :as preprocess]
            [metabase.query-processor.process-common :as process-common]
            [metabase.util.i18n :refer [tru]]
            [metabase.query-processor.error-type :as qp.error-type]))

(defn- mbql->native
  "Compile an MBQL `query` to a native query."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (let [native (driver/mbql->native driver/*driver* query)]
      (-> query
          #_(dissoc :query)
          (assoc :native      native
                 :type        :native
                 ;; TODO -- not sure if good idea
                 #_::mbql-query #_(:query query))))))

(defn compile-preprocessed
  [preprocessed-query]
  {:post [(map? preprocessed-query) (map? %)]}
  (process-common/ensure-store-and-driver preprocessed-query
    ;; TODO -- need to add `:native_form` to the results metadata
    (try
      (mbql->native preprocessed-query)
      (catch Throwable e
        (throw (ex-info (tru "Error compiling query: {0}" (ex-message e))
                        {:query preprocessed-query
                         :type  (:type (ex-data e) qp.error-type/qp)}))))))

(defn compile
  "Compile an MBQL `query` to a native one."
  [query]
  {:post [(map? query) (map? %)]}
  (process-common/ensure-store-and-driver query
    (-> query preprocess/preprocess compile-preprocessed)))

(defn splice-params
  "Splice any prepared statement (or equivalent) parameters spliced into the query itself as literals. This is used to
  power features such as 'Convert this Question to SQL'. (Currently, this function is mostly used by tests and in the
  REPL; [[metabase.query-processor.middleware.splice-params-in-response]] middleware handles simliar functionality for
  queries that are actually executed.)"
  [native-query]
  (process-common/ensure-store-and-driver native-query
    (driver/splice-parameters-into-native-query driver/*driver* native-query)))

(defn compile-and-splice-params
  "Compile `query` to a native query, and splice parameters into it with [[splice-params]]."
  [query]
  (process-common/ensure-store-and-driver query
    (splice-params (compile query))))
