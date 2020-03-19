(ns metabase.query-processor.middleware.validate
  "Middleware for checking that a normalized query is valid."
  (:require [metabase.mbql.schema :as mbql.s]))

(defn validate-query
  "Middleware that validates a query immediately after normalization."
  [qp]
  (fn [query rff context]
    (mbql.s/validate-query query)
    (qp query rff context)))
