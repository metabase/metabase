(ns metabase.test.async
  "Utilities for testing async API endpoints."
  (:require [clojure.tools.logging :as log]
            [metabase.feature-extraction.async :as async]
            [metabase.models.computation-job :refer [ComputationJob]]
            [metabase.util :as u]))

(def ^:dynamic ^Integer *max-while-runtime*
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

(defn result!
  "Blocking version of async/result."
  [job-id]
  (let [f (-> #'async/running-jobs
              deref                  ; var
              deref                  ; atom
              (get job-id))]
    (if (and f (not (future-cancelled? f)))
      {:result     @f
       :status     (-> job-id ComputationJob :status)
       :created-at (u/new-sql-timestamp)}
      (do
        ;; Make sure the transaction has finished
        (binding [*max-while-runtime* 1000]
          (while-with-timeout (-> job-id ComputationJob async/running?)))
        (async/result (ComputationJob job-id))))))
