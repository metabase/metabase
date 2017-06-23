(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `METRIC` and `SEGMENT` 'macros' in *unexpanded* MBQL queries.

   Code in charge of expanding [\"METRIC\" ...] and [\"SEGMENT\" ...] forms in MBQL queries.
   (METRIC forms are expanded into aggregations and sometimes filter clauses, while SEGMENT forms
    are expanded into filter clauses.)

   TODO - this namespace is ancient and written with MBQL '95 in mind, e.g. it is case-sensitive.
   At some point this ought to be reworked to be case-insensitive and cleaned up."
  (:require [clojure.tools.logging :as log]
            (metabase.query-processor [interface :as i]
                                      [util :as qputil])
            [clojure.core.match :refer [match]]
            [clojure.walk :as walk]
            [toucan.db :as db]
            [metabase.util :as u]))


;;; ------------------------------------------------------------ Utils ------------------------------------------------------------

(defn- non-empty-clause? [clause]
  (and clause
       (or (not (sequential? clause))
           (and (seq clause)
                (not (every? nil? clause))))))

;;; ------------------------------------------------------------ Segments ------------------------------------------------------------

(defn- segment-parse-filter-subclause [form]
  (when (non-empty-clause? form)
    (match form
      ["SEGMENT" (segment-id :guard integer?)] (:filter (db/select-one-field :definition 'Segment :id segment-id))
      subclause                                subclause
      form                                     (throw (java.lang.Exception. (format "segment-parse-filter-subclause failed: invalid clause: %s" form))))))

(defn- segment-parse-filter [form]
  (when (non-empty-clause? form)
    (match form
      ["AND" & subclauses] (into ["AND"] (mapv segment-parse-filter subclauses))
      ["OR"  & subclauses] (into ["OR"]  (mapv segment-parse-filter subclauses))
      subclause            (segment-parse-filter-subclause subclause)
      form                 (throw (java.lang.Exception. (format "segment-parse-filter failed: invalid clause: %s" form))))))

(defn- expand-segments [query-dict]
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


;;; ------------------------------------------------------------ Metrics ------------------------------------------------------------

(defn- metric? [aggregation]
  (match aggregation
    ["METRIC" (_ :guard integer?)] true
    _                              false))

(defn- metric-id [metric]
  (when (metric? metric)
    (second metric)))

(defn- maybe-unnest-ag-clause
  "Unnest AG-CLAUSE if it's wrapped in a vector (i.e. if it is using the \"multiple-aggregation\" syntax).
   (This is provided merely as a convenience to facilitate implementation of the Query Builder, so it can use the same UI for
   normal aggregations and Metric creation. *METRICS DO NOT SUPPORT MULTIPLE AGGREGATIONS,* so if nested syntax is used, any
   aggregation after the first will be ignored.)"
  [ag-clause]
  (if (and (coll? ag-clause)
           (every? coll? ag-clause))
    (first ag-clause)
    ag-clause))

(defn- expand-metric [metric-clause filter-clauses-atom]
  (let [{filter-clause :filter, ag-clause :aggregation} (db/select-one-field :definition 'Metric, :id (metric-id metric-clause))]
    (when filter-clause
      (swap! filter-clauses-atom conj filter-clause))
    (maybe-unnest-ag-clause ag-clause)))

(defn- expand-metrics-in-ag-clause [query-dict filter-clauses-atom]
  (walk/postwalk (fn [form]
                   (if-not (metric? form)
                     form
                     (expand-metric form filter-clauses-atom)))
                 query-dict))

(defn- add-metrics-filter-clauses
  "Add any FILTER-CLAUSES to the QUERY-DICT. If query has existing filter clauses, the new ones are
   combined with an `:and` filter clause."
  [query-dict filter-clauses]
  (if-not (seq filter-clauses)
    query-dict
    (update-in query-dict [:query :filter] merge-filter-clauses (if (> (count filter-clauses) 1)
                                                                  (cons "AND" filter-clauses)
                                                                  (first filter-clauses)))))

(defn- expand-metrics* [query-dict]
  (let [filter-clauses-atom (atom [])
        query-dict          (expand-metrics-in-ag-clause query-dict filter-clauses-atom)]
    (add-metrics-filter-clauses query-dict @filter-clauses-atom)))

(defn- expand-metrics [{{aggregations :aggregation} :query, :as query-dict}]
  (if-not (seq aggregations)
    ;; :aggregation is empty, so no METRIC to expand
    query-dict
    ;; otherwise walk the query dict and expand METRIC clauses
    (expand-metrics* query-dict)))


;;; ------------------------------------------------------------ Middleware ------------------------------------------------------------

(defn- expand-metrics-and-segments "Expand the macros (SEGMENT, METRIC) in a QUERY."
  [query]
  (-> query
      expand-metrics
      expand-segments))


(defn- expand-macros* [query]
  (if-not (qputil/mbql-query? query)
    query
    (u/prog1 (expand-metrics-and-segments query)
      (when (and (not i/*disable-qp-logging*)
                 (not= <> query))
        (log/debug (u/format-color 'cyan "\n\nMACRO/SUBSTITUTED: %s\n%s" (u/emoji "😻") (u/pprint-to-str <>)))))))

(defn expand-macros
  "Middleware that looks for `METRIC` and `SEGMENT` macros in an unexpanded MBQL query and substitute the macros for their contents."
  [qp] (comp qp expand-macros*))
