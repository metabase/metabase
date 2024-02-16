(ns metabase.query-processor.compile
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.driver :as driver]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- compile* [{query-type :type, :as query}]
  (if (= query-type :native)
    (:native query)
    (driver/mbql->native driver/*driver* query)))

(mu/defn compile-preprocessed :- :map
  "Compile an already-preprocessed query, if needed. Returns just the resulting 'inner' native query.
  `:native` key in a legacy query."
  [preprocessed-query :- :map]
  (qp.setup/with-qp-setup [preprocessed-query preprocessed-query]
    (try
      (compile* preprocessed-query)
      (catch Throwable e
        (throw (ex-info (i18n/tru "Error compiling query: {0}" (ex-message e))
                        {:query preprocessed-query, :type qp.error-type/driver}
                        e))))))

(mu/defn compile :- :map
  "Preprocess and compile a query, if needed. Returns just the resulting 'inner' native query."
  [query :- :map]
  (qp.setup/with-qp-setup [query query]
    (compile-preprocessed (qp.preprocess/preprocess query))))

(mu/defn compile-and-splice-parameters :- :map
  "Return the native form for a `query`, with any prepared statement (or equivalent) parameters spliced into the query
  itself as literals. This is used to power features such as 'Convert this Question to SQL'.

  (Currently, this function is mostly used by tests and a few API endpoints;
  REPL; [[metabase.query-processor.middleware.splice-params-in-response/splice-params-in-response]] middleware handles
  similar functionality for queries that are actually executed.)"
  [query :- :map]
  (qp.setup/with-qp-setup [query query]
    (driver/splice-parameters-into-native-query driver/*driver* (compile query))))
