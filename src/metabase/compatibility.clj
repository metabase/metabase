(ns metabase.compatibility
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]))

(defn normalize-dataset-query
  "Normalize the query `dataset-query` received via an HTTP call.
  Handles both (legacy) MBQL and pMBQL queries."
  [dataset-query]
  (if (= (lib/normalized-query-type dataset-query) :mbql/query)
    (lib/normalize dataset-query)
    (mbql.normalize/normalize dataset-query)))
