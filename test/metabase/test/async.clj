(ns metabase.test.async
  "Utilities for testing async API endpoints."
  (:require [metabase.feature-extraction.async :as async]
            [metabase.models.computation-job :refer [ComputationJob]]))

(defn result!
  "Blocking version of async/result."
  [job-id]
  (-> #'async/running-jobs
      deref          ; var
      deref          ; atom
      (get job-id)
      deref)         ; future
  (async/result (ComputationJob job-id)))
