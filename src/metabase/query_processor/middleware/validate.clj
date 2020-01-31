(ns metabase.query-processor.middleware.validate
  "Middleware for checking that a normalized query is valid."
  (:require [clojure.core.async :as a]
            [metabase.mbql.schema :as mbql.s]))

(defn validate-query
  "Middleware that validates a query immediately after normalization."
  [qp]
  (fn [query xform {:keys [raise-chan], :as chans}]
    (try
      (mbql.s/validate-query query)
      (qp query xform chans)
      (catch Throwable e
        (a/>!! raise-chan e)))))
