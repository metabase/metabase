(ns metabase.test.async
  "Utilities for testing async API endpoints."
  (:require [clojure.tools.logging :as log]
            [metabase.feature-extraction.async :as async]
            [metabase.models.computation-job :refer [ComputationJob]]
            [metabase.util :as u]))

(def ^:dynamic ^Integer *max-while-runtime*
  "Maximal time in milliseconds `while-with-timeout` runs."
  100000)

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

(def ^:private job-done? (atom #{}))

(add-watch (deref #'async/running-jobs) :done-watch
           (fn [_ _ old new]
             (let [in-new? (set (keys new))]
               (reduce #(swap! %1 conj %2)
                       job-done?
                       (remove in-new? (keys old))))))

(defn result!
  "Blocking version of async/result."
  [job-id]
  (while-with-timeout (not (and (@job-done? job-id)
                                (-> job-id
                                    ComputationJob
                                    async/result
                                    (find :result)))))
  (async/result (ComputationJob job-id)))
