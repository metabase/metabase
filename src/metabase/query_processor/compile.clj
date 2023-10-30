(ns metabase.query-processor.compile
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.driver :as driver]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.mbql-to-native :as mbql-to-native]
   [metabase.util.i18n :as i18n]))

(defn compile [preprocessed-query]
  (try
    (assoc preprocessed-query :native (mbql-to-native/query->native-form preprocessed-query))
    (catch Throwable e
      (throw (ex-info (i18n/tru "Error compiling query: {0}" (ex-message e))
                      {:query preprocessed-query, :driver driver/*driver*, :type qp.error-type/driver}
                      e)))))
