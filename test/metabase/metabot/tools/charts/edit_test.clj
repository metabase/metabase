(ns metabase.metabot.tools.charts.edit-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.charts.edit :as edit-chart]
   [metabase.test :as mt]))

(deftest edit-chart-test
  (testing "edits a chart's visualization type"
    (let [mp (mt/metadata-provider)
          charts-state {"chart-abc" {:chart-id "chart-abc"
                                     :queries [(lib/native-query mp "SELECT * FROM orders")]
                                     :chart-type :bar}}
          {:keys [result]} (edit-chart/edit-chart
                            {:chart-id "chart-abc"
                             :new-chart-type :line
                             :charts-state charts-state})]
      (is (contains? result :chart-id))
      (is (string? (:chart-id result)))
      ;; New chart should have a different ID
      (is (not= "chart-abc" (:chart-id result)))
      (is (= :line (:chart-type result)))
      (is (str/includes? (:chart-content result) "<chart"))
      (is (str/includes? (:chart-content result) "line"))
      (is (str/starts-with? (:chart-link result) "metabase://chart/"))
      (is (contains? result :instructions))))

  (testing "edits chart to various types"
    (let [mp (mt/metadata-provider)
          charts-state {"chart-456" {:chart-id "chart-456"
                                     :queries [(lib/native-query mp "SELECT * FROM orders")]}}]
      (doseq [new-type [:pie :table :scatter :area :sunburst]]
        (let [{:keys [result]} (edit-chart/edit-chart
                                {:chart-id "chart-456"
                                 :new-chart-type new-type
                                 :charts-state charts-state})]
          (is (= new-type (:chart-type result))
              (str "New chart type " new-type " should be set correctly"))))))

  (testing "throws error for invalid chart type"
    (let [charts-state {"chart-789" {:chart-id "chart-789"}}]
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
           :charts-state {}})))))
