(ns metabase.query-processor.middleware.async
  (:require [clojure.core.async :as a]))

(def ^:private in-flight* (atom 0))

(defn in-flight
  "Return the number of queries currently in flight."
  []
  @in-flight*)

(defn- call-thunk-on-completion-xform
  "A transducer that will call `thunk` when results are finished."
  [call-thunk-on-completion xf]
  (fn
    ([]
     (xf))

    ([result]
     (call-thunk-on-completion)
     (xf result))

    ([result results-metadata]
     (xf result results-metadata))

    ([result results-metadata row]
     (xf result results-metadata row))))

(defn count-in-flight-queries
  "Middleware that tracks the current number of queries in flight."
  [qp]
  (fn [query xform {:keys [raise-chan finished-chan], :as chans}]
    (try
      (swap! in-flight* inc)
      #_(locking println (println "<adding query to in flight> in flight:" (in-flight))) ; NOCOMMIT
      (a/go
        (a/<! finished-chan)
        (swap! in-flight* dec)
        #_(locking println (println "<removing from in flight> in flight:" (in-flight)))) ; NOCOMMIT
      (qp query xform chans)
      (catch Throwable e
        (a/>!! raise-chan e)))))
