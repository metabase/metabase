(ns metabase.util.ui-logic-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.ui-logic :as ui-logic]))

(deftest ^:parallel find-goal-value-with-numeric-goal-test
  (testing "Progress chart goal value extraction with numeric goal"
    (let [result {:card {:display :progress
                         :visualization_settings {:progress.goal 100}}
                  :result {:data {:cols []
                                  :rows []}}}]
      (is (= 100 (ui-logic/find-goal-value result))))))

(deftest ^:parallel find-goal-value-with-column-reference-numeric-test
  (testing "Progress chart goal value extraction with column reference that exists and is numeric"
    (let [result {:card {:display :progress
                         :visualization_settings {:progress.goal "target_column"}}
                  :result {:data {:cols [{:name "value_column" :base_type :type/Integer}
                                         {:name "target_column" :base_type :type/Float}]
                                  :rows [[50 75.5]]}}}]
      (is (= 75.5 (ui-logic/find-goal-value result))))))

(deftest ^:parallel find-goal-value-with-column-reference-non-numeric-test
  (testing "Progress chart goal value extraction with column reference that exists but is not numeric"
    (let [result {:card {:display :progress
                         :visualization_settings {:progress.goal "text_column"}}
                  :result {:data {:cols [{:name "value_column" :base_type :type/Integer}
                                         {:name "text_column" :base_type :type/Text}]
                                  :rows [[50 "not a number"]]}}}]
      (is (= 0 (ui-logic/find-goal-value result))))))

(deftest ^:parallel find-goal-value-with-nonexistent-column-test
  (testing "Progress chart goal value extraction with column reference that doesn't exist"
    (let [result {:card {:display :progress
                         :visualization_settings {:progress.goal "nonexistent_column"}}
                  :result {:data {:cols [{:name "value_column" :base_type :type/Integer}]
                                  :rows [[50]]}}}]
      (is (= 0 (ui-logic/find-goal-value result))))))

(deftest ^:parallel find-goal-value-with-nil-goal-test
  (testing "Progress chart goal value extraction with nil goal setting"
    (let [result {:card {:display :progress
                         :visualization_settings {:progress.goal nil}}
                  :result {:data {:cols []
                                  :rows []}}}]
      (is (= 0 (ui-logic/find-goal-value result))))))

(deftest ^:parallel find-goal-value-with-no-goal-test
  (testing "Progress chart goal value extraction with no goal setting"
    (let [result {:card {:display :progress
                         :visualization_settings {}}
                  :result {:data {:cols []
                                  :rows []}}}]
      (is (= 0 (ui-logic/find-goal-value result))))))

(deftest ^:parallel extract-goal-value-from-column-with-valid-data-test
  (testing "Extract goal value from column with valid column and data"
    (let [columns [{:name "value"} {:name "target"}]
          rows [[100 200]]]
      (is (= 200 (#'ui-logic/extract-goal-value-from-column "target" columns rows))))))

(deftest ^:parallel extract-goal-value-from-column-with-infinity-test
  (testing "Extract goal value from column with infinity value"
    (let [columns [{:name "value"} {:name "target"}]
          rows [[100 "Infinity"]]]
      (is (= ##Inf (#'ui-logic/extract-goal-value-from-column "target" columns rows))))))

(deftest ^:parallel extract-goal-value-from-column-with-nil-test
  (testing "Extract goal value from column with nil value"
    (let [columns [{:name "value"} {:name "target"}]
          rows [[100 nil]]]
      (is (= 0 (#'ui-logic/extract-goal-value-from-column "target" columns rows))))))

(deftest ^:parallel extract-goal-value-from-column-with-no-rows-test
  (testing "Extract goal value from column with no rows"
    (let [columns [{:name "value"} {:name "target"}]
          rows []]
      (is (nil? (#'ui-logic/extract-goal-value-from-column "target" columns rows))))))
