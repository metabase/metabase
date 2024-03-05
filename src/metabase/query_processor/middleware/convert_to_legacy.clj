(ns metabase.query-processor.middleware.convert-to-legacy
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.util :as u]))

(defn convert-to-legacy
  "Middleware that converts and MLv2 query back to a legacy query. This is temporary until we concert the entire QP to use MLv2 everywhere."
  [query]
  (letfn [(->legacy-MBQL [query]
            (u/prog1 (lib.convert/->legacy-MBQL query)
              ;; NOCOMMIT
              (println "CONVERTED TO LEGACY MBQL:\n" (u/pprint-to-str <>))))]
    (cond-> query
      (= (:lib/type query) :mbql/query) ->legacy-MBQL)))
