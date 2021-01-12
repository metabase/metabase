(ns metabase.api.pivot
  (:require [metabase.util.i18n :refer [tru]]))

(defn check-query-type
  "Check that a query type is of a specific type, for example pivot tables require MBQL queries"
  [expected-type query]
  (let [found-type (:type query)]
    (when (not= expected-type found-type)
      (throw (ex-info (tru "Queries must be of type ''{0}'', found ''{1}''" expected-type found-type) {:type found-type})))))
