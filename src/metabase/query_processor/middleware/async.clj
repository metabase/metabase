(ns metabase.query-processor.middleware.async
  (:require [clojure.core.async :as a]
            [metabase.query-processor.context :as context]))

(def ^:private in-flight* (agent 0))

(defn in-flight
  "Return the number of queries currently in flight."
  []
  @in-flight*)

(defn count-in-flight-queries
  "Middleware that tracks the current number of queries in flight."
  [qp]
  (fn [query rff context]
    (send in-flight* inc)
    (let [out-chan (context/out-chan context)]
      (a/go
        (a/<! out-chan)
        (send in-flight* dec)))
    (qp query rff context)))
