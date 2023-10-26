(ns metabase.query-processor.middleware.mbql-to-native
  "Middleware responsible for converting MBQL queries to native queries (by calling the driver's QP methods)
   so the query can then be executed."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]
   [metabase.query-processor.error-type :as qp.error-type]))

(defn query->native-form
  "Return a `:native` query form for `query`, converting it from MBQL if needed."
  [query]
  (case ((some-fn :lib/type :type) query)
    ;; MLv2 pMBQL query, convert to legacy and recur
    :mbql/query
    (recur (lib.convert/->legacy-MBQL query))

    ;; legacy MBQL query
    :query
    (try
      (driver/mbql->native driver/*driver* query)
      (catch Throwable e
        (throw (ex-info (format "Error compiling MBQL query to native: %s" (ex-message e))
                        {:type qp.error-type/driver, :driver driver/*driver*, :query query}
                        e))))

    ;; legacy native query
    :native
    (:native query)))

(defn add-native-query-to-metadata
  "Post-processing middleware. Add native query to result metadata."
  [query rff]
  (fn add-native-query-to-metadata-rff [metadata]
    (rff (assoc metadata :native_form (:native query)))))
