(ns metabase-enterprise.metabot-v3.tools.create-chart-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-chart :as create-chart]))

(deftest create-chart-test
  (testing "creates a chart from a query"
    (let [queries-state {"q-123" {:query-id "q-123"
                                  :query-content "SELECT * FROM orders"
                                  :database 1}}
          result (create-chart/create-chart
                  {:query-id "q-123"
                   :chart-type :bar
                   :queries-state queries-state})]
      (is (contains? result :chart-id))
      (is (string? (:chart-id result)))
      (is (= :bar (:chart-type result)))
      (is (= "q-123" (:query-id result)))
      (is (str/includes? (:chart-content result) "<chart"))
      (is (str/includes? (:chart-content result) "bar"))
      (is (str/starts-with? (:chart-link result) "metabase://chart/"))
      (is (contains? result :instructions))))

  (testing "creates chart with different types"
    (let [queries-state {"q-456" {:query-id "q-456"
                                  :sql "SELECT COUNT(*) FROM users"
                                  :database 1}}]
      (doseq [chart-type [:line :pie :table :scatter :area]]
        (let [result (create-chart/create-chart
                      {:query-id "q-456"
                       :chart-type chart-type
                       :queries-state queries-state})]
          (is (= chart-type (:chart-type result))
              (str "Chart type " chart-type " should be set correctly"))))))

  (testing "throws error for invalid chart type"
    (let [queries-state {"q-789" {:query-id "q-789"
                                  :query-content "SELECT 1"
                                  :database 1}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid chart type"
           (create-chart/create-chart
            {:query-id "q-789"
             :chart-type :invalid-type
             :queries-state queries-state})))))

  (testing "throws error when query not found"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Query not found"
         (create-chart/create-chart
          {:query-id "nonexistent"
           :chart-type :bar
           :queries-state {}})))))

(deftest create-chart-tool-test
  (testing "tool handler returns structured output on success"
    (let [queries-state {"q-tool-1" {:query-id "q-tool-1"
                                     :query-content "SELECT 1"
                                     :database 1}}
          result (create-chart/create-chart-tool
                  {:query-id "q-tool-1"
                   :chart-type :line
                   :queries-state queries-state})]
      (is (contains? result :structured-output))
      (is (contains? (:structured-output result) :chart-id))
      (is (contains? (:structured-output result) :chart-link))))

  (testing "tool handler returns error output on failure"
    (let [result (create-chart/create-chart-tool
                  {:query-id "nonexistent"
                   :chart-type :bar
                   :queries-state {}})]
      (is (contains? result :output))
      (is (string? (:output result)))
      (is (str/includes? (:output result) "Query not found"))))

  (testing "tool handler returns error for invalid chart type"
    (let [queries-state {"q-test" {:query-id "q-test"
                                   :query-content "SELECT 1"
                                   :database 1}}
          result (create-chart/create-chart-tool
                  {:query-id "q-test"
                   :chart-type :bad-type
                   :queries-state queries-state})]
      (is (contains? result :output))
      (is (str/includes? (:output result) "Invalid chart type")))))
