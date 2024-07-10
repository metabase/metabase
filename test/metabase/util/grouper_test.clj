(ns metabase.util.grouper-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.grouper :as grouper]))

(deftest disable-grouper-test
  (testing "with grouper disabled, the submitted item should be processed immediately"
    (mt/with-temporary-setting-values [disable-grouper-batch-processing true]
      (let [processed?  (atom nil)
            g           (grouper/start!
                         (fn [items]
                           (reset! processed? items))
                         :capacity 5
                         :interval (* 10 1000))]
        (u/with-timeout 1
          (grouper/submit! g 1))
        (is (= [1] @processed?))))))
