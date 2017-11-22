(ns metabase.feature-extraction.async-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.async :refer :all]
            [metabase.models.computation-job :refer [ComputationJob]]
            [metabase.test.async :refer [result!]]))

(expect
  true
  (let [job-id (compute (gensym) (constantly 42))
        _      (result! job-id)]
    (done? (ComputationJob job-id))))

(expect
  [true :canceled false]
  (let [job-id (compute (gensym) #(do (while (not (Thread/interrupted))) 42))
        r?     (running? (ComputationJob job-id))]
    (cancel (ComputationJob job-id))
    [r? (:status (ComputationJob job-id)) (running? (ComputationJob job-id))]))

(expect
  42
  (-> (compute (gensym) (constantly 42))
      result!
      :result))

(expect
  "foo"
  (-> (compute (gensym) #(throw (Throwable. "foo")))
      result!
      :result
      :cause))
