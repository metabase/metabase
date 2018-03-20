(ns metabase.util.query
  "Utility functions for dealing with structured queries."
  (:require [clojure.core.match :refer [match]]))

;; TODO These functions are written for MBQL '95. MBQL '98 doesn't require that clause identifiers be uppercased, or
;; strings. Also, I'm not convinced `:segment` or `:metric` are actually part of MBQL since they aren't in the MBQL
;; '98 reference

(defn- parse-filter-subclause [subclause]
  (match subclause
    ["SEGMENT" (segment-id :guard integer?)] segment-id
    _                                        nil))

;; TODO This doesn't handle the NOT clause
(defn- parse-filter [clause]
  (match clause
    ["AND" & subclauses] (mapv parse-filter subclauses)
    ["OR" & subclauses]  (mapv parse-filter subclauses)
    subclause            (parse-filter-subclause subclause)))

(defn extract-segment-ids
  "Return the IDs of all `Segments` in the query. (I think that's what this does? :flushed:)"
  [query]
  (when-let [filter-clause (:filter query)]
    (->> (parse-filter filter-clause)
         flatten
         (filter identity)
         set)))

(defn extract-metric-ids
  "Return the IDs of all `Metrics` in the query. (I think that's what this does? :flushed:)"
  [query]
  (when-let [aggregation-clause (:aggregation query)]
    (match aggregation-clause
      ["METRIC" (metric-id :guard integer?)] #{metric-id}
      _                                       nil)))
