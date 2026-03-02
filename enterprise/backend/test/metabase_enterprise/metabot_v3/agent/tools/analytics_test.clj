(ns metabase-enterprise.metabot-v3.agent.tools.analytics-test
  "Tests for the find_outliers agent tool wrapper."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.tools :as agent-tools]
   [metabase-enterprise.metabot-v3.agent.tools.analytics :as agent-analytics]
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as outlier-tools]))

;;; ------------------------------------------ schema / metadata tests -----------------------------------------------

(deftest find-outliers-tool-schema-test
  (testing "tool has correct :tool-name metadata"
    (let [tool-meta (meta #'agent-analytics/find-outliers-tool)]
      (is (= "find_outliers" (:tool-name tool-meta)))))

  (testing "tool is in state-dependent-tools"
    (is (contains? @#'agent-tools/state-dependent-tools "find_outliers"))))

;;; ----------------------------------- query resolution from memory tests -------------------------------------------

(deftest find-outliers-tool-query-resolution-test
  (testing "query_id resolved from memory → passed as :query in data-source"
    (let [captured-args (atom nil)
          mock-query    {:database 1 :type :native :native {:query "SELECT * FROM orders"}}
          memory        (atom {:state {:queries {"q123" mock-query}}})]
      (with-redefs [outlier-tools/find-outliers
                    (fn [args] (reset! captured-args args)
                      {:structured-output []})]
        (binding [shared/*memory-atom* memory]
          (agent-analytics/find-outliers-tool
           {:data_source {:query_id "q123" :result_field_id "t1-2"}}))
        (let [ds (:data-source @captured-args)]
          (is (= mock-query (:query ds)))
          (is (nil? (:query_id ds)))
          (is (= "t1-2" (:result-field-id ds)))))))

  (testing "query_id not found in memory → error message"
    (let [memory (atom {:state {:queries {}}})]
      (with-redefs [outlier-tools/find-outliers
                    (fn [_] (throw (Exception. "should not be called")))]
        (let [result (binding [shared/*memory-atom* memory]
                       (agent-analytics/find-outliers-tool
                        {:data_source {:query_id "nonexistent"}}))]
          (is (string? (:output result)))
          (is (str/includes? (:output result) "not found"))))))

  (testing "report_id passed through with key normalization"
    (let [captured-args (atom nil)]
      (with-redefs [outlier-tools/find-outliers
                    (fn [args] (reset! captured-args args)
                      {:structured-output []})]
        (binding [shared/*memory-atom* (atom {:state {:queries {}}})]
          (agent-analytics/find-outliers-tool
           {:data_source {:report_id 42}}))
        (let [ds (:data-source @captured-args)]
          (is (= 42 (:report-id ds)))
          (is (nil? (:report_id ds)))))))

  (testing "metric_id passed through with key normalization"
    (let [captured-args (atom nil)]
      (with-redefs [outlier-tools/find-outliers
                    (fn [args] (reset! captured-args args)
                      {:structured-output []})]
        (binding [shared/*memory-atom* (atom {:state {:queries {}}})]
          (agent-analytics/find-outliers-tool
           {:data_source {:metric_id 7}}))
        (let [ds (:data-source @captured-args)]
          (is (= 7 (:metric-id ds)))
          (is (nil? (:metric_id ds))))))))

;;; ----------------------------------------- output format tests ----------------------------------------------------

(deftest find-outliers-tool-output-format-test
  (testing "empty outliers → 'No outliers detected' message"
    (with-redefs [outlier-tools/find-outliers (fn [_] {:structured-output []})]
      (binding [shared/*memory-atom* (atom {:state {:queries {}}})]
        (let [result (agent-analytics/find-outliers-tool
                      {:data_source {:report_id 1}})]
          (is (str/includes? (:output result) "No outliers detected"))))))

  (testing "non-empty outliers → XML formatted output with count"
    (with-redefs [outlier-tools/find-outliers
                  (fn [_] {:structured-output [{:dimension "2024-01-15" :value 999}
                                               {:dimension "2024-03-20" :value 888}]})]
      (binding [shared/*memory-atom* (atom {:state {:queries {}}})]
        (let [result (agent-analytics/find-outliers-tool
                      {:data_source {:report_id 1}})]
          (is (str/includes? (:output result) "outliers"))
          (is (str/includes? (:output result) "2024-01-15"))
          (is (str/includes? (:output result) "999"))
          (is (str/includes? (:output result) "2024-03-20"))
          (is (str/includes? (:output result) "888"))
          ;; Should also return the structured data
          (is (= 2 (count (:structured-output result)))))))))
