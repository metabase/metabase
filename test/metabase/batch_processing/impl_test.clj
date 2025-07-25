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
