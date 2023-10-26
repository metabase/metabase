(ns metabase.query-processor.compile
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.query-processor.middleware.mbql-to-native :as mbql-to-native]))

(defn compile [query]
  (assoc query :native (mbql-to-native/query->native-form query)))
