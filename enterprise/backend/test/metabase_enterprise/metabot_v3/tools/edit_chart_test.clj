(ns metabase-enterprise.metabot-v3.tools.edit-chart-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.edit-chart :as edit-chart]))

(deftest edit-chart-test
  (testing "edits a chart's visualization type"
    (let [charts-state {"chart-abc" {:chart-id "chart-abc"
                                     :query-id "q-123"
                                     :chart-type :bar
                                     :query-content "SELECT * FROM orders"}}
          result (edit-chart/edit-chart
                  {:chart-id "chart-abc"
                   :new-chart-type :line
                   :charts-state charts-state})]
      (is (contains? result :chart-id))
      (is (string? (:chart-id result)))
      ;; New chart should have a different ID
      (is (not= "chart-abc" (:chart-id result)))
      (is (= :line (:chart-type result)))
      (is (= "q-123" (:query-id result)))
      (is (str/includes? (:chart-content result) "<chart"))
      (is (str/includes? (:chart-content result) "line"))
      (is (str/starts-with? (:chart-link result) "metabase://chart/"))
      (is (contains? result :instructions))))

  (testing "edits chart to various types"
    (let [charts-state {"chart-456" {:chart-id "chart-456"
                                     :query-id "q-original"
                                     :chart-type :bar
                                     :query-content "SELECT COUNT(*) FROM users"}}]
      (doseq [new-type [:pie :table :scatter :area :sunburst]]
        (let [result (edit-chart/edit-chart
                      {:chart-id "chart-456"
                       :new-chart-type new-type
                       :charts-state charts-state})]
          (is (= new-type (:chart-type result))
              (str "New chart type " new-type " should be set correctly"))
          ;; Query ID should be preserved
          (is (= "q-original" (:query-id result)))))))

  (testing "throws error for invalid chart type"
    (let [charts-state {"chart-789" {:chart-id "chart-789"
                                     :query-id "q-test"
                                     :chart-type :bar
                                     :query-content "SELECT 1"}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid chart type"
           (edit-chart/edit-chart
            {:chart-id "chart-789"
             :new-chart-type :invalid-type
             :charts-state charts-state})))))

  (testing "throws error when chart not found"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"issues accessing the chart data"
         (edit-chart/edit-chart
          {:chart-id "nonexistent"
           :new-chart-type :bar
           :charts-state {}}))))

  (testing "throws error when chart has no query-id"
    (let [charts-state {"chart-bad" {:chart-id "chart-bad"
                                     :chart-type :bar}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"issues accessing the chart data"
           (edit-chart/edit-chart
            {:chart-id "chart-bad"
             :new-chart-type :line
             :charts-state charts-state}))))))

(deftest edit-chart-tool-test
  (testing "tool handler returns structured output on success"
    (let [charts-state {"chart-tool-1" {:chart-id "chart-tool-1"
                                        :query-id "q-1"
                                        :chart-type :bar
                                        :query-content "SELECT 1"}}
          result (edit-chart/edit-chart-tool
                  {:chart-id "chart-tool-1"
                   :new-chart-type :pie
                   :charts-state charts-state})]
      (is (contains? result :structured-output))
      (is (contains? (:structured-output result) :chart-id))
      (is (contains? (:structured-output result) :chart-link))
      (is (= :pie (:chart-type (:structured-output result))))))

  (testing "tool handler returns error output when chart not found"
    (let [result (edit-chart/edit-chart-tool
                  {:chart-id "nonexistent"
                   :new-chart-type :bar
                   :charts-state {}})]
      (is (contains? result :output))
      (is (string? (:output result)))
      (is (str/includes? (:output result) "issues accessing the chart data"))))

  (testing "tool handler returns error for invalid chart type"
    (let [charts-state {"chart-test" {:chart-id "chart-test"
                                      :query-id "q-test"
                                      :chart-type :bar
                                      :query-content "SELECT 1"}}
          result (edit-chart/edit-chart-tool
                  {:chart-id "chart-test"
                   :new-chart-type :bad-type
                   :charts-state charts-state})]
      (is (contains? result :output))
      (is (str/includes? (:output result) "Invalid chart type")))))
