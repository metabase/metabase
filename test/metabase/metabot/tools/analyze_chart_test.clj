(ns metabase.metabot.tools.analyze-chart-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.analyze-chart :as analyze-chart]
   [metabase.metabot.tools.shared :as shared]))

(set! *warn-on-reflection* true)

(defn- analyze
  "Run `analyze-chart-tool` for `chart-config-id` with `chart-configs` seeded into agent memory."
  [chart-config-id chart-configs]
  (binding [shared/*memory-atom* (atom {:state {:chart-configs chart-configs}})]
    (analyze-chart/analyze-chart-tool {:chart_config_id chart-config-id :deep false})))

(defn- numeric-series-config
  "A well-formed single-series row chart config."
  []
  {"c1" {:display_type "row"
         :title        "Orders by category"
         :series       {"Count" {:x            {:name "category" :type "string"}
                                 :y            {:name "count" :type "number"}
                                 :x_values     ["A" "B" "C" "D"]
                                 :y_values     [42 53 51 54]
                                 :display_name "Count"}}}})

(deftest ^:parallel analyze-chart-tool-chart-not-found-test
  (testing "an unknown chart_config_id returns a not-found message"
    (is (= {:output (str "Chart config not found: c1. "
                         "Available chart configs can be found in the viewing context.")}
           (analyze "c1" {})))))

(deftest ^:parallel analyze-chart-tool-valid-chart-test
  (testing "a well-formed chart config produces a chart analysis"
    (let [output (:output (analyze "c1" (numeric-series-config)))]
      (is (str/includes? output "Chart Analysis"))
      (is (str/includes? output "Categorical")))))

(deftest ^:parallel analyze-chart-tool-empty-series-test
  (testing "a chart config with no series is rejected"
    (is (= {:output "Failed to analyze chart: This chart has no series data to analyze."}
           (analyze "c1" {"c1" {:display_type "row" :title "Empty" :series {}}})))))

(deftest ^:parallel analyze-chart-tool-empty-y-values-test
  (testing "a series with no data points is rejected"
    (is (= {:output "Failed to analyze chart: Series \"Count\" has no data points to analyze."}
           (analyze "c1" {"c1" {:display_type "row"
                                :title        "No points"
                                :series       {"Count" {:x            {:name "category" :type "string"}
                                                        :y            {:name "count" :type "number"}
                                                        :x_values     []
                                                        :y_values     []
                                                        :display_name "Count"}}}})))))

(deftest ^:parallel analyze-chart-tool-non-numeric-y-values-test
  (testing "a series with non-numeric y-values is rejected"
    (is (= {:output (str "Failed to analyze chart: Series \"Count\" has non-numeric y-values. "
                         "Chart analysis requires a numeric y-axis metric.")}
           (analyze "c1" {"c1" {:display_type "row"
                                :title        "Survey responses"
                                :series       {"Count" {:x            {:name "frequency" :type "string"}
                                                        :y            {:name "count" :type "number"}
                                                        :x_values     ["Never" "Rarely" "Often"]
                                                        :y_values     ["One"   "Two"    "Three"]
                                                        :display_name "Count"}}}})))))
