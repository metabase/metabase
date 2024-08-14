(ns ^{:deprecated "0.51.0"} metabase.driver.sql.util.unprepare
  "Utility functions for converting a prepared statement with `?` param placeholders into a plain SQL query by splicing
  params in place.

  TODO -- since this is no longer strictly a 'util' namespace (most `:sql-jdbc` drivers need to implement one or
  methods from here) let's rename this `metabase.driver.sql.unprepare` when we get a chance."
  (:require
   [metabase.driver.sql.query-processor :as sql.qp]))

(set! *warn-on-reflection* true)

;;; `sql.qp/inline-value` is just a Potemkin-style copy of [[sql.qp/inline-value]], so `defmethod` on it will actually
;;; just define a method on `inline-value`.
(def ^{:added "0.32.0" :arglists '(^String [driver value]), :deprecated "0.51.0"} unprepare-value
  "Deprecated in 0.51.0 and renamed to [[metabase.driver.sql.query-processor/inline-value]]. Replace method
  implementations of `unprepare-value` with `inline-value`."
  sql.qp/inline-value)

;;; add a watch so if `inline-value` changes we point to the updated value.
(add-watch
 #'sql.qp/inline-value
 ::reload
 (fn [_key _ref _old-state _new-state]
   #_{:clj-kondo/ignore [:deprecated-var]}
   (alter-var-root #'unprepare-value (constantly sql.qp/inline-value))))
