(ns metabase.sql-tools.metrics
  "Prometheus metrics instrumentation for sql-tools operations.

   Provides recording functions and a `with-operation-timing` macro that wraps
   sql-tools public API calls with counters and histograms, labeled by parser
   backend and operation name."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Known labels --------------------------------------------------

(def ^:private parsers ["macaw" "sqlglot"])

(def ^:private operations
  ["returned-columns"
   "referenced-tables"
   "referenced-fields"
   "field-references"
   "validate-query"
   "replace-names"
   "referenced-tables-raw"
   "simple-query?"
   "add-into-clause"])

(def ^:private operation-labels
  (vec (for [parser    parsers
             operation operations]
         {:parser parser :operation operation})))

(defmethod analytics/known-labels :metabase-sql-tools/operations-total [_] operation-labels)
(defmethod analytics/known-labels :metabase-sql-tools/operations-completed [_] operation-labels)
(defmethod analytics/known-labels :metabase-sql-tools/operations-failed [_] operation-labels)

;;; -------------------------------------------------- Recording fns --------------------------------------------------

(defn record-operation-start!
  "Record the start of an sql-tools operation."
  [parser operation]
  (analytics/inc! :metabase-sql-tools/operations-total
                   {:parser (name parser) :operation operation}))

(defn record-operation-completion!
  "Record the successful completion of an sql-tools operation."
  [parser operation duration-ms]
  (let [labels {:parser (name parser) :operation operation}]
    (analytics/inc! :metabase-sql-tools/operations-completed labels)
    (analytics/observe! :metabase-sql-tools/operation-duration-ms labels duration-ms)))

(defn record-operation-failure!
  "Record the failure of an sql-tools operation."
  [parser operation duration-ms]
  (let [labels {:parser (name parser) :operation operation}]
    (analytics/inc! :metabase-sql-tools/operations-failed labels)
    (analytics/observe! :metabase-sql-tools/operation-duration-ms labels duration-ms)))

;;; -------------------------------------------------- Timing macro --------------------------------------------------

(defmacro with-operation-timing
  "Execute body while timing an sql-tools operation. Automatically records
   start, completion or failure metrics labeled by parser and operation.

   Usage:
   (with-operation-timing [parser \"returned-columns\"]
     (interface/returned-columns-impl parser driver native-query))"
  [[parser operation] & body]
  `(let [parser#    ~parser
         operation# ~operation
         start#     (u/start-timer)]
     (record-operation-start! parser# operation#)
     (try
       (let [result# (do ~@body)]
         (record-operation-completion! parser# operation# (long (u/since-ms start#)))
         result#)
       (catch Throwable t#
         (record-operation-failure! parser# operation# (long (u/since-ms start#)))
         (throw t#)))))
