(ns metabase.test.async
  "Utilities for testing async API endpoints."
  (:require [metabase.feature-extraction.async :as async]
            [metabase.models.computation-job :refer [ComputationJob]]))

(defn result!
  "Blocking version of async/result."
  [job-id]
  @((deref (deref #'async/running-jobs)) job-id)
  (async/result (ComputationJob job-id)))
