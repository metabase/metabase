(ns metabase.feature-extraction.async-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.async :refer :all]
            [metabase.models.computation-job :refer [ComputationJob]]))

(expect
  true
  (let [job-id (compute (gensym) (constantly 1))]
    (Thread/sleep 100)
    (done? (ComputationJob job-id))))

(expect
  [true false false]
  (let [job-id (compute (gensym) #(loop [] (Thread/sleep 100) (recur)))]
    (Thread/sleep 100)
    (let [r? (running? (ComputationJob job-id))]
      (cancel (ComputationJob job-id))
      [r? (done? (ComputationJob job-id)) (running? (ComputationJob job-id))])))

(expect
  {:status :done
   :result 1}
  (let [job-id (compute (gensym) (constantly 1))]
    (Thread/sleep 100)
    (select-keys (result (ComputationJob job-id)) [:status :result])))

(expect
  [:error
   "foo"]
  (let [job-id (compute (gensym) #(throw (Throwable. "foo")))]
    (Thread/sleep 100)
    (let [job (ComputationJob job-id)]
      [(:status job)
       (-> job result :result :cause)])))
