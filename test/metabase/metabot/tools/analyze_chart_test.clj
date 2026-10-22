(ns metabase.metabot.tools.analyze-chart-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.interestingness.core :as interestingness]
   [metabase.metabot.tools.analyze-chart :as analyze-chart]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]))

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

(deftest ^:parallel analyze-chart-tool-saved-question-test
  (testing "a saved question's chart config, which carries its description, produces a chart analysis"
    (let [configs (assoc-in (numeric-series-config) ["c1" :description] "Order counts per product category")]
      (is (str/includes? (:output (analyze "c1" configs)) "Chart Analysis")))))

(deftest ^:parallel analyze-chart-tool-empty-series-test
  (testing "a chart config with no series is rejected"
    (is (= {:output "This chart has no series data to analyze."}
           (analyze "c1" {"c1" {:display_type "row" :title "Empty" :series {}}})))))

(deftest ^:parallel analyze-chart-tool-empty-y-values-test
  (testing "a chart whose only series has no data points is rejected"
    (is (= {:output "This chart has no series data to analyze."}
           (analyze "c1" {"c1" {:display_type "row"
                                :title        "No points"
                                :series       {"Count" {:x            {:name "category" :type "string"}
                                                        :y            {:name "count" :type "number"}
                                                        :x_values     []
                                                        :y_values     []
                                                        :display_name "Count"}}}})))))

(deftest ^:parallel analyze-chart-tool-no-complete-points-test
  (testing "a chart whose only series has no point with both an x and a y value is rejected like an empty one"
    (doseq [[x-values y-values] [[[nil nil] [3.0 4.0]]
                                 [["2024-01-01T00:00:00Z" "2024-02-01T00:00:00Z"] [nil nil]]
                                 [[nil "2024-01-01T00:00:00Z"] [3.0 nil]]]]
      (testing (pr-str x-values y-values)
        (is (= {:output "This chart has no series data to analyze."}
               (analyze "c1" {"c1" {:display_type "line"
                                    :title        "Orders over time"
                                    :series       {"Count" {:x            {:name "created_at" :type "datetime"}
                                                            :y            {:name "count" :type "number"}
                                                            :x_values     x-values
                                                            :y_values     y-values
                                                            :display_name "Count"}}}})))))))

(deftest ^:parallel analyze-chart-tool-all-null-series-test
  (testing "a series with only null values is left out, and the other series is analyzed"
    (let [series (fn [y-name y-values]
                   {:x            {:name "created_at" :type "datetime"}
                    :y            {:name y-name :type "number"}
                    :x_values     ["2024-01-01T00:00:00Z" "2024-02-01T00:00:00Z" "2024-03-01T00:00:00Z"]
                    :y_values     y-values
                    :display_name y-name})]
      (is (str/includes? (:output (analyze "c1" {"c1" {:display_type "line"
                                                       :title        "Orders over time"
                                                       :series       {"Count"   (series "Count" [3.0 4.0 5.0])
                                                                      "Refunds" (series "Refunds" [nil nil nil])}}}))
                         "## Series: Count")))))

(deftest ^:parallel analyze-chart-tool-non-numeric-y-values-test
  (testing "a series with non-numeric y-values is rejected"
    (is (= {:output (str "Series \"Count\" has non-numeric y-values. "
                         "Chart analysis requires a numeric y-axis metric.")}
           (analyze "c1" {"c1" {:display_type "row"
                                :title        "Survey responses"
                                :series       {"Count" {:x            {:name "frequency" :type "string"}
                                                        :y            {:name "count" :type "number"}
                                                        :x_values     ["Never" "Rarely" "Often"]
                                                        :y_values     ["One"   "Two"    "Three"]
                                                        :display_name "Count"}}}})))))

(deftest ^:parallel analyze-chart-tool-unexpected-error-test
  (testing "an unexpected error propagates to the agent loop"
    (mt/with-dynamic-fn-redefs [interestingness/compute-chart-stats (fn [& _] (throw (ex-info "boom" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            (analyze "c1" (numeric-series-config)))))))
