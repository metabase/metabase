(ns metabase.feature-extraction.async-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.async :refer :all]
            [metabase.models.computation-job :refer [ComputationJob]]))

(expect
  true
  (let [job-id (compute (constantly 1))]
    (Thread/sleep 100)
    (done? (ComputationJob job-id))))

(expect
  true
  (let [job-id (compute #(do (Thread/sleep 10000) nil))]
    (Thread/sleep 100)
    (running? (ComputationJob job-id))))

(expect
  [true false false]
  (let [job-id (compute #(do (Thread/sleep 100000) nil))]
    (Thread/sleep 100)
    (let [r? (running? (ComputationJob job-id))]
      (cancel (ComputationJob job-id))
      [r? (done? (ComputationJob job-id)) (running? (ComputationJob job-id))])))

(expect
  {:status :done
   :result 1}
  (let [job-id (compute (constantly 1))]
    (Thread/sleep 100)
    (result (ComputationJob job-id))))
