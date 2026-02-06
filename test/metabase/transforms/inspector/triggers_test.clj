(ns metabase.transforms.inspector.triggers-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms.inspector.triggers :as triggers]))

(deftest evaluate-condition-default-test
  (testing "unknown condition names return false"
    (is (not (triggers/evaluate-condition {:name :nonexistent} {})))))

(deftest evaluate-condition-high-null-rate-test
  (testing "high-null-rate triggers when null_rate > 0.2"
    (is (true? (triggers/evaluate-condition
                {:name :high-null-rate :card_id "step-1"}
                {"step-1" {"null_rate" 0.3}}))))
  (testing "high-null-rate does not trigger at exactly 0.2"
    (is (not (triggers/evaluate-condition
              {:name :high-null-rate :card_id "step-1"}
              {"step-1" {"null_rate" 0.2}}))))
  (testing "high-null-rate does not trigger below 0.2"
    (is (not (triggers/evaluate-condition
              {:name :high-null-rate :card_id "step-1"}
              {"step-1" {"null_rate" 0.1}}))))
  (testing "high-null-rate handles missing card result"
    (is (not (triggers/evaluate-condition
              {:name :high-null-rate :card_id "missing"}
              {}))))
  (testing "high-null-rate handles missing null_rate key"
    (is (not (triggers/evaluate-condition
              {:name :high-null-rate :card_id "step-1"}
              {"step-1" {}})))))

(deftest evaluate-condition-has-unmatched-rows-test
  (testing "has-unmatched-rows triggers when null_rate > 0.05"
    (is (true? (triggers/evaluate-condition
                {:name :has-unmatched-rows :card_id "step-1"}
                {"step-1" {"null_rate" 0.1}}))))
  (testing "has-unmatched-rows does not trigger at exactly 0.05"
    (is (not (triggers/evaluate-condition
              {:name :has-unmatched-rows :card_id "step-1"}
              {"step-1" {"null_rate" 0.05}}))))
  (testing "has-unmatched-rows does not trigger below 0.05"
    (is (not (triggers/evaluate-condition
              {:name :has-unmatched-rows :card_id "step-1"}
              {"step-1" {"null_rate" 0.01}}))))
  (testing "has-unmatched-rows handles missing card result"
    (is (not (triggers/evaluate-condition
              {:name :has-unmatched-rows :card_id "missing"}
              {})))))
