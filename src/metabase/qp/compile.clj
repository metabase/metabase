(ns metabase.qp.compile
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.driver :as driver]
   [metabase.lib.convert :as lib.convert]))

(defn compile [query]
  (let [query (cond-> query
                (< (driver/mbql-version driver/*driver*) 5) lib.convert/->legacy-MBQL)]
    (driver/mbql->native driver/*driver* query)))
