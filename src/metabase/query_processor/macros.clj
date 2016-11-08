(ns metabase.query-processor.macros
  (:require [clojure.core.match :refer [match]]
            [metabase.db :as db]
            [metabase.util :as u]))

(defn- non-empty-clause? [clause]
  (and clause
       (or (not (sequential? clause))
           (and (seq clause)
                (not (every? nil? clause))))))

(defmacro defparser
  "Convenience for writing a parser function, i.e. one that pattern-matches against a lone argument."
  [fn-name & match-forms]
  `(defn ~(vary-meta fn-name assoc :private true) [form#]
     (when (non-empty-clause? form#)
       (match form#
         ~@match-forms
         form# (throw (Exception. (format ~(format "%s failed: invalid clause: %%s" fn-name) form#)))))))

(defparser segment-parse-filter-subclause
  ["SEGMENT" (segment-id :guard integer?)] (:filter (db/select-one-field :definition 'Segment, :id segment-id))
  subclause  subclause)

(defparser segment-parse-filter
  ["AND" & subclauses] (into ["AND"] (mapv segment-parse-filter subclauses))
  ["OR" & subclauses]  (into ["OR"] (mapv segment-parse-filter subclauses))
  subclause            (segment-parse-filter-subclause subclause))

(defn- macroexpand-segment [query-dict]
  (if (non-empty-clause? (get-in query-dict [:query :filter]))
    (update-in query-dict [:query :filter] segment-parse-filter)
    query-dict))

(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn- merge-aggregation [aggregations new-ag]
  (if (map? aggregations)
    (recur [aggregations] new-ag)
    (conj aggregations new-ag)))

(defn- merge-aggregations {:style/indent 0} [query-dict [aggregation & more]]
  (if-not aggregation
    ;; no more aggregations? we're done
    query-dict
    ;; otherwise determine if this aggregation is a METRIC and recur
    (let [metric-def (match aggregation
                       ["METRIC" (metric-id :guard integer?)] (db/select-one-field :definition 'Metric, :id metric-id)
                       _                                      nil)]
      (recur (if-not metric-def
               ;; not a metric, move to next aggregation
               query-dict
               ;; it *is* a metric, insert it into the query appropriately
               (-> query-dict
                   (update-in [:query :aggregation] merge-aggregation (:aggregation metric-def))
                   (update-in [:query :filter] merge-filter-clauses (:filter metric-def))))
             more))))

(defn- remove-metrics [aggregations]
  (if-not (and (sequential? aggregations)
               (every? coll? aggregations))
    (recur [aggregations])
    (vec (for [ag    aggregations
               :when (match ag
                       ["METRIC" (_ :guard integer?)] false
                       _                              true)]
           ag))))

(defn- macroexpand-metric [{{aggregations :aggregation} :query, :as query-dict}]
  (if-not (seq aggregations)
    ;; :aggregation is empty, so no METRIC to expand
    query-dict
    ;; we have an aggregation clause, so lets see if we are using a METRIC
    ;; (since `:aggregation` can be either single or multiple, wrap single ones so `merge-aggregations` can always assume input is multiple)
    (merge-aggregations
      (update-in query-dict [:query :aggregation] remove-metrics)
      (if (and (sequential? aggregations)
               (every? coll? aggregations))
        aggregations
        [aggregations]))))

(defn expand-macros "Expand the macros (SEGMENT, METRIC) in a QUERY-DICT."
  [query-dict]
  (-> query-dict
      macroexpand-metric
      macroexpand-segment))
