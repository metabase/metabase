(ns metabase.mq.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]))

(set! *warn-on-reflection* true)

(deftest ^:parallel dedup-distinct-test
  (testing "removes exact duplicates while preserving order"
    (is (= [1 2 3 4] (mq/dedup-distinct [1 2 3 2 1 4]))))
  (testing "returns empty vec for empty input"
    (is (= [] (mq/dedup-distinct []))))
  (testing "no-op when there are no duplicates"
    (is (= [1 2 3] (mq/dedup-distinct [1 2 3]))))
  (testing "works with maps"
    (is (= [{:a 1} {:a 2}] (mq/dedup-distinct [{:a 1} {:a 2} {:a 1}]))))
  (testing "works with nested vectors"
    (is (= [["card" "w1"] ["card" "w2"]]
           (mq/dedup-distinct [["card" "w1"] ["card" "w2"] ["card" "w1"]])))))
