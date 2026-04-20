(ns metabase.agent-lib.common.context-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.common.context :as context]))

(deftest ^:parallel source-metric-id-test
  (testing "returns id for metric source entities"
    (is (= 42 (context/source-metric-id {:source-entity {:model "metric" :id 42}}))))
  (testing "returns nil for table source entities"
    (is (nil? (context/source-metric-id {:source-entity {:model "table" :id 1}}))))
  (testing "returns nil for non-positive ids"
    (is (nil? (context/source-metric-id {:source-entity {:model "metric" :id 0}})))
    (is (nil? (context/source-metric-id {:source-entity {:model "metric" :id -1}}))))
  (testing "returns nil for missing source-entity"
    (is (nil? (context/source-metric-id {})))))

(deftest ^:parallel source-table-id-test
  (testing "returns id for table source entities"
    (is (= 1 (context/source-table-id {:source-entity {:model "table" :id 1}}))))
  (testing "returns nil for metric source entities"
    (is (nil? (context/source-table-id {:source-entity {:model "metric" :id 42}}))))
  (testing "returns nil for non-positive ids"
    (is (nil? (context/source-table-id {:source-entity {:model "table" :id 0}}))))
  (testing "returns nil for missing source-entity"
    (is (nil? (context/source-table-id {})))))
