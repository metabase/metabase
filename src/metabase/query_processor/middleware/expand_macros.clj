(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `METRIC` and `SEGMENT` 'macros' in *unexpanded* MBQL queries.

   Code in charge of expanding [\"METRIC\" ...] and [\"SEGMENT\" ...] forms in MBQL queries.
   (METRIC forms are expanded into aggregations and sometimes filter clauses, while SEGMENT forms
    are expanded into filter clauses.)

   TODO - this namespace is ancient and written with MBQL '95 in mind, e.g. it is case-sensitive.
   At some point this ought to be reworked to be case-insensitive and cleaned up."
  (:require [clojure.tools.logging :as log]
            [metabase.models
             [metric :refer [Metric]]
             [segment :refer [Segment]]]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]
            [metabase.util :as u]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    UTIL FNS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- is-clause? [clause-names object]
  (and (sequential? object)
       ((some-fn string? keyword?) (first object))
       (contains? clause-names (qputil/normalize-token (first object)))))

(defn- non-empty-clause? [clause]
  (and clause
       (or (not (sequential? clause))
           (and (seq clause)
                (not (every? nil? clause))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    SEGMENTS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- segment-parse-filter-subclause [form]
  (when (non-empty-clause? form)
    (if-not (is-clause? #{:segment} form)
      form
      (:filter (db/select-one-field :definition Segment :id (u/get-id (second form)))))))

(defn- segment-parse-filter [form]
  (when (non-empty-clause? form)
    (if (is-clause? #{:and :or :not} form)
      ;; for forms that start with AND/OR/NOT recursively parse the subclauses and put them nicely back into their
      ;; compound form
      (cons (first form) (mapv segment-parse-filter (rest form)))
      ;; otherwise we should have a filter subclause so parse it as such
      (segment-parse-filter-subclause form))))

(defn- expand-segments [query-dict]
  (cond
    (non-empty-clause? (get-in query-dict [:query :filter]))
    (update-in query-dict [:query :filter] segment-parse-filter)

    (non-empty-clause? (get-in query-dict [:query :source-query :filter]))
    (update-in query-dict [:query :source-query :filter] segment-parse-filter)

    :else
    query-dict))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    METRICS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ga-metric?
  "Is this metric clause not a Metabase Metric, but rather a GA one? E.g. something like [metric ga:users]. We want to
   ignore those because they're not the same thing at all as MB Metrics and don't correspond to objects in our
   application DB."
  [[_ id]]
  (boolean
   (when ((some-fn string? keyword?) id)
     (re-find #"^ga(id)?:" (name id)))))

(defn- metric? [aggregation]
  (and (is-clause? #{:metric} aggregation)
       (not (ga-metric? aggregation))))

(defn- metric-id [metric]
  (when (metric? metric)
    (u/get-id (second metric))))

(defn- maybe-unnest-ag-clause
  "Unnest AG-CLAUSE if it's wrapped in a vector (i.e. if it is using the \"multiple-aggregation\" syntax).
   (This is provided merely as a convenience to facilitate implementation of the Query Builder, so it can use the same
   UI for normal aggregations and Metric creation. *METRICS DO NOT SUPPORT MULTIPLE AGGREGATIONS,* so if nested syntax
   is used, any aggregation after the first will be ignored.)"
  [ag-clause]
  (if (and (coll? ag-clause)
           (every? coll? ag-clause))
    (first ag-clause)
    ag-clause))

(defn- expand-metric [metric-clause filter-clauses-atom]
  (let [{filter-clause :filter, ag-clause :aggregation} (db/select-one-field :definition Metric
                                                          :id (metric-id metric-clause))]
    (when filter-clause
      (swap! filter-clauses-atom conj filter-clause))
    (maybe-unnest-ag-clause ag-clause)))

(defn- expand-metrics-in-ag-clause [query-dict filter-clauses-atom]
  (qputil/postwalk-pred metric?
                        #(expand-metric % filter-clauses-atom)
                        query-dict))

(defn merge-filter-clauses
  "Merge filter clauses."
  ([] [])
  ([clause] clause)
  ([base-clause additional-clauses]
   (cond
     (and (seq base-clause)
          (seq additional-clauses)) [:and base-clause additional-clauses]
     (seq base-clause)              base-clause
     (seq additional-clauses)       additional-clauses
     :else                          [])))

(defn- add-metrics-filter-clauses
  "Add any FILTER-CLAUSES to the QUERY-DICT. If query has existing filter clauses, the new ones are
   combined with an `:and` filter clause."
  [query-dict filter-clauses]
  (if-not (seq filter-clauses)
    query-dict
    (update-in query-dict [:query :filter] merge-filter-clauses (if (> (count filter-clauses) 1)
                                                                  (cons :and filter-clauses)
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

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
  "Middleware that looks for `METRIC` and `SEGMENT` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [qp] (comp qp expand-macros*))
