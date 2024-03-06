(ns metabase.query-processor.middleware.convert-to-legacy
  (:require
   [metabase.lib.convert :as lib.convert]))

(defn convert-to-legacy
  "Middleware that converts and MLv2 query back to a legacy query. This is temporary until we concert the entire QP to
  use MLv2 everywhere."
  [query]
  (letfn [(->legacy-MBQL [query]
            (lib.convert/->legacy-MBQL query))]
    (cond-> query
      (= (:lib/type query) :mbql/query) ->legacy-MBQL)))
