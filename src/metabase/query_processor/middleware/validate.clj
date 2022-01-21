(ns metabase.query-processor.middleware.validate
  "Middleware for checking that a normalized query is valid."
  (:require [metabase.mbql.schema :as mbql.s]))

(defn validate-query
  "Middleware that validates a query immediately after normalization."
  [query]
  (mbql.s/validate-query query)
  query)
