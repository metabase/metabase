(ns metabase.batch-processing.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.batch-processing.impl :as grouper]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest synchronous-batch-updates-test
  (testing "with grouper disabled, the submitted item should be processed immediately"
    (mt/with-temporary-setting-values [synchronous-batch-updates true]
      (let [processed?  (atom nil)
            g           (grouper/start!
                         (fn [items]
                           (reset! processed? items))
                         :capacity 5
                         :interval (* 10 1000))]
        (u/with-timeout 1000
          (grouper/submit! g 1))
        (is (= [1] @processed?))))))

(deftest flush-test
  (testing "flush! processes everything already submitted, without exposing its sentinel to the batch fn"
    (let [batches (atom [])
          g       (grouper/start!
                   (fn [items]
                     (swap! batches conj (vec items)))
                   :capacity 5
                   :interval (* 60 1000))]
      (try
        (grouper/submit! g 1)
        (grouper/submit! g 2)
        (is (= [] @batches))
        (u/with-timeout 5000
          (grouper/flush! g))
        (is (= [[1 2]] @batches))
        (testing "a flush with nothing queued does not call the batch fn"
          (u/with-timeout 5000
            (grouper/flush! g))
          (is (= [[1 2]] @batches)))
        (finally
          (grouper/shutdown! g))))))
