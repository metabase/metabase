(ns metabase.test.async
  "Utilities for testing async API endpoints."
  (:require [clojure.tools.logging :as log]
            [metabase.feature-extraction.async :as async]
            [metabase.models.computation-job :refer [ComputationJob]]))

(defn result!
  "Blocking version of async/result."
  [job-id]
  (when-let [f (-> #'async/running-jobs
                   deref                  ; var
                   deref                  ; atom
                   (get job-id))]
    (when-not (or (future-cancelled? f)
                  (future-done? f))
      @f))
  (async/result (ComputationJob job-id)))

(def ^:dynamic *max-while-runtime*
  "Maximal time in milliseconds `while-with-timeout` runs."
  10000000)

(defmacro while-with-timeout
  "Like `clojure.core/while` except it runs a maximum of `*max-while-runtime*`
   milliseconds (assuming running time for one iteration is << `*max-while-runtime*`)."
  [test & body]
  `(let [start# (System/currentTimeMillis)]
     (while (and ~test
                 (< (- (System/currentTimeMillis) start#) *max-while-runtime*))
       ~@body)
     (when (>= (- (System/currentTimeMillis) start#) *max-while-runtime*)
       (log/warn "While loop terminated due to exceeded max runtime."))))
