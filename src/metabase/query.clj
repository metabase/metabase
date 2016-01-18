(ns metabase.query
  "Functions for dealing with structured queries."
  (:require [clojure.core.match :refer [match]]))


(defn- parse-filter-subclause [subclause]
  (match subclause
         ["SEGMENT" (segment-id :guard integer?)] segment-id
         subclause                                nil))

(defn- parse-filter [clause]
  (match clause
         ["AND" & subclauses] (mapv parse-filter subclauses)
         ["OR" & subclauses]  (mapv parse-filter subclauses)
         subclause            (parse-filter-subclause subclause)))

(defn extract-segment-ids [query]
  (when-let [filter-clause (:filter query)]
    (->> (parse-filter filter-clause)
         flatten
         (filter identity)
         set)))

(defn extract-metric-ids [query]
  (when-let [aggregation-clause (:aggregation query)]
    (match aggregation-clause
      ["METRIC" (metric-id :guard integer?)] #{metric-id}
      other                                  nil)))
