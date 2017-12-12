(ns metabase.feature-extraction.async-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.async :refer :all]
            [metabase.models.computation-job :refer [ComputationJob]]
            [metabase.test.async :refer :all]))

;; DISABLED due to constant failures 12/6/17. Fix soon!
(expect
    true
    (let [job-id (compute (gensym) (constantly 42))]
      (result! job-id)
      (done? (ComputationJob job-id))))

(expect
  [true :canceled false]
  (let [job-id (compute (gensym) #(do
                                    (while-with-timeout (not (Thread/interrupted)))
                                    42))
        r?     (running? (ComputationJob job-id))]
    (cancel (ComputationJob job-id))
    [r? (:status (ComputationJob job-id)) (running? (ComputationJob job-id))]))

(expect
  42
  (-> (compute (gensym) (constantly 42))
      result!
      :result))

;; DISABLED due to constant failures 12/6/17. Fix soon!
(expect
  "foo"
  (-> (compute (gensym) #(throw (Throwable. "foo")))
      result!
      :result
      :cause))
