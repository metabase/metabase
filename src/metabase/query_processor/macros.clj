(ns metabase.query-processor.macros
  (:require [clojure.core.match :refer [match]]
            [metabase.db :as db]))

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

(defn- macroexpand-metric [query-dict]
  (if-not (non-empty-clause? (get-in query-dict [:query :aggregation]))
    ;; aggregation is empty, so no METRIC to expand
    query-dict
    ;; we have an aggregation clause, so lets see if we are using a METRIC
    (if-let [metric-def (match (get-in query-dict [:query :aggregation])
                          ["METRIC" (metric-id :guard integer?)] (db/select-one-field :definition 'Metric, :id metric-id)
                          _                                      nil)]
      ;; we have a metric, so merge its definition into the existing query-dict
      (-> query-dict
          (assoc-in [:query :aggregation] (:aggregation metric-def))
          (assoc-in [:query :filter] (merge-filter-clauses (get-in query-dict [:query :filter]) (:filter metric-def))))
      ;; no metric, just use the original query-dict
      query-dict)))

(defn expand-macros "Expand the macros (SEGMENT, METRIC) in a QUERY-DICT."
  [query-dict]
  (-> query-dict
      macroexpand-metric
      macroexpand-segment))
