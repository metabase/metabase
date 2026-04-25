(ns metabase.metabot.stats.repr-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.stats.categorical :as categorical]
   [metabase.metabot.stats.core :as stats.core]
   [metabase.metabot.stats.histogram :as histogram]
   [metabase.metabot.stats.repr :as repr]
   [metabase.metabot.stats.scatter :as scatter]
   [metabase.metabot.stats.time-series :as time-series]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Helpers -------------------------------------------------------

(defn- make-series
  "Create a series config with n data points."
  [n]
  {:x {:name "Date" :type "datetime"}
   :y {:name "Value" :type "number"}
   :display_name "Test"
   :x_values (mapv #(str "2020-01-" (format "%02d" (inc (mod % 28)))) (range n))
   :y_values (mapv double (range n))})

(defn- make-chart-config
  "Create a chart config with the given number of series, each with n data points."
  [series-count n]
  {:display_type "line"
   :title "Test Chart"
   :series (into {} (for [i (range series-count)]
                      [(str "series_" i) (make-series n)]))})

;;; ------------------------------------------ Repr Limits Note Tests ------------------------------------------------

(deftest ^:parallel repr-includes-downsampled-note-test
  (testing "Representation includes a note about downsampled data"
    (let [n      (+ @#'stats.core/max-data-points-per-series 1000)
          config (make-chart-config 1 n)
          stats  (stats.core/compute-chart-stats config {:deep? false})
          repr   (repr/generate-representation {:title "Test" :display-type "line" :stats stats})]
      (is (str/includes? repr "Data Limits Applied"))
      (is (str/includes? repr "downsampled")))))

(deftest ^:parallel repr-includes-correlations-capped-note-test
  (testing "Representation includes a note about capped correlations"
    (let [n-series (+ @#'stats.core/max-series-for-correlations 5)
          config   (make-chart-config n-series 50)
          stats    (stats.core/compute-chart-stats config {:deep? true})
          repr     (repr/generate-representation {:title "Test" :display-type "line" :stats stats})]
      (is (str/includes? repr "Data Limits Applied"))
      (is (str/includes? repr "correlations were limited")))))

(deftest ^:parallel repr-no-limits-note-when-within-bounds-test
  (testing "No limits note when data is within bounds"
    (let [config (make-chart-config 2 100)
          stats  (stats.core/compute-chart-stats config {:deep? true})
          repr   (repr/generate-representation {:title "Test" :display-type "line" :stats stats})]
      (is (not (str/includes? repr "Data Limits Applied"))))))

;;; ------------------------------------------- Histogram Repr Tests -------------------------------------------------

(deftest ^:parallel repr-histogram-shows-shape-test
  (testing "representation includes Distribution Shape when enough bins"
    (let [xs           (range 0 100 10)
          ys           [1 3 8 15 25 25 15 8 3 1]
          series-stats (#'histogram/compute-series-stats xs ys)
          stats        {:chart-type   :histogram
                        :series-count 1
                        :series       {"Test Series" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Test Series"))
      (is (str/includes? rep "Distribution Shape")))))

(deftest ^:parallel repr-histogram-shows-percentiles-and-iqr-test
  (testing "histogram representation includes estimated percentiles and IQR"
    (let [xs           (range 0 100 10)
          ys           [1 3 8 15 25 25 15 8 3 1]
          series-stats (#'histogram/compute-series-stats xs ys)
          stats        {:chart-type   :histogram
                        :series-count 1
                        :series       {"Values" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Estimated Percentiles"))
      (is (str/includes? rep "P50≈"))
      (is (str/includes? rep "Estimated IQR")))))

(deftest ^:parallel repr-histogram-shows-structure-test
  (testing "histogram representation includes structural metrics"
    (let [series-stats (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])
          stats        {:chart-type   :histogram
                        :series-count 1
                        :series       {"Bins" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Structure"))
      (is (str/includes? rep "mode bin"))
      (is (str/includes? rep "top 3 bins contain")))))

;;; -------------------------------------------- Scatter Repr Tests --------------------------------------------------

(deftest ^:parallel repr-scatter-shows-relationship-test
  (testing "representation includes Relationship with strength and direction"
    (let [series-stats (#'scatter/compute-series-stats [1 2 3 4 5] [10 20 30 40 50])
          stats        {:chart-type   :scatter
                        :series-count 1
                        :series       {"Test Series" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Test Series"))
      (is (str/includes? rep "Relationship"))
      (is (str/includes? rep "strong positive")))))

(deftest ^:parallel repr-scatter-shows-trend-line-test
  (testing "scatter representation includes trend line equation when regression is present"
    (let [series-stats (#'scatter/compute-series-stats [1 2 3 4 5] [12 14 16 18 20])
          stats        {:chart-type   :scatter
                        :series-count 1
                        :series       {"Linear" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Trend Line"))
      (is (str/includes? rep "y =")))))

;;; ------------------------------------------ Categorical Repr Tests ------------------------------------------------

(deftest ^:parallel repr-categorical-includes-key-info-test
  (testing "representation includes series name, data count, and Categories"
    (let [series-stats (#'categorical/compute-series-stats ["A" "B" "C"] [100 200 150])
          stats        {:chart-type   :categorical
                        :series-count 1
                        :series       {"Test Series" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Test Series"))
      (is (str/includes? rep "Categories"))
      (is (str/includes? rep "Top Categories")))))

(deftest ^:parallel repr-categorical-shows-bottom-categories-for-large-dataset-test
  (testing "Bottom Categories shown when > 15 categories"
    (let [xs           (map #(str "Cat" (format "%02d" %)) (range 1 21))
          ys           (map double (range 1 21))
          series-stats (#'categorical/compute-series-stats xs ys)
          stats        {:chart-type   :categorical
                        :series-count 1
                        :series       {"Many" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Top Categories"))
      (is (str/includes? rep "Bottom Categories"))
      ;; highest value category (Cat20) appears
      (is (str/includes? rep "Cat20"))
      ;; lowest value category (Cat01) appears
      (is (str/includes? rep "Cat01")))))

(deftest ^:parallel repr-categorical-no-bottom-categories-for-small-dataset-test
  (testing "Bottom Categories absent when <= 15 categories"
    (let [xs           (map #(str "Cat" %) (range 1 16))
          ys           (map double (range 1 16))
          series-stats (#'categorical/compute-series-stats xs ys)
          stats        {:chart-type   :categorical
                        :series-count 1
                        :series       {"Few" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Top Categories"))
      (is (not (str/includes? rep "Bottom Categories"))))))

(deftest ^:parallel repr-categorical-sparse-data-warning-test
  (testing "sparse data warning shown for series with < 10 data points"
    (let [series-stats (#'categorical/compute-series-stats ["A" "B" "C"] [100 200 150])
          stats        {:chart-type   :categorical
                        :series-count 1
                        :series       {"Few" series-stats}}
          rep          (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "limited data points")))))

;;; ----------------------------------------- Time Series Repr Tests -------------------------------------------------

(deftest ^:parallel generate-temporal-context-test
  (testing "temporal context includes current date, day of week, week, month, and quarter"
    (let [result (#'repr/generate-temporal-context)]
      (is (str/includes? result "Today is"))
      (is (some #(str/includes? result %)
                ["Monday" "Tuesday" "Wednesday" "Thursday" "Friday" "Saturday" "Sunday"]))
      (is (str/includes? (u/lower-case-en result) "week"))
      (is (str/includes? (u/lower-case-en result) "month"))
      (is (str/includes? (u/lower-case-en result) "quarter"))
      (is (some #(str/includes? result %) ["Q1" "Q2" "Q3" "Q4"])))))

(deftest ^:parallel repr-time-series-includes-series-name-and-trend-test
  (testing "time series representation includes series name and trend direction"
    (let [values [10.0 20.0 30.0 40.0 50.0]
          dates  ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05"]
          series-stats (#'time-series/compute-series-stats values dates {})
          stats {:chart-type   :time-series
                 :series-count 1
                 :series       {"Revenue" series-stats}}
          rep (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Revenue"))
      (is (str/includes? rep "Trend"))
      (is (str/includes? rep "Time Series")))))

(deftest ^:parallel repr-time-series-multi-series-test
  (testing "representation with multiple series includes all series names"
    (let [make-stats (fn [values dates]
                       (#'time-series/compute-series-stats values dates {}))
          stats {:chart-type   :time-series
                 :series-count 2
                 :series       {"Sales"   (make-stats [10.0 20.0 30.0 40.0 50.0]
                                                      ["d1" "d2" "d3" "d4" "d5"])
                                "Revenue" (make-stats [20.0 40.0 60.0 80.0 100.0]
                                                      ["d1" "d2" "d3" "d4" "d5"])}}
          rep (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Sales"))
      (is (str/includes? rep "Revenue")))))

(deftest ^:parallel repr-time-series-deep-stats-test
  (testing "deep stats include volatility, significant changes, and most recent change"
    (let [values (mapv #(* 10.0 %) (range 1 13))
          dates  (mapv #(format "2024-%02d" %) (range 1 13))
          series-stats (#'time-series/compute-series-stats values dates {:deep? true})
          stats  {:chart-type   :time-series
                  :series-count 1
                  :series       {"Metric" series-stats}}
          rep    (repr/generate-representation {:stats stats})]
      (is (str/includes? rep "Volatility"))
      (is (str/includes? rep "Significant Changes"))
      (is (str/includes? rep "Most Recent Change")))))

;;; ---------------------------------------- generate-representation dispatch ------------------------------------------

(deftest ^:parallel generate-representation-dispatches-to-correct-renderer-test
  (testing "dispatches to the correct renderer for known chart type"
    (let [ts-stats {:chart-type :time-series :series-count 1
                    :series {"S" (#'time-series/compute-series-stats
                                  [1.0 2.0 3.0 4.0 5.0]
                                  ["d1" "d2" "d3" "d4" "d5"] {})}}]
      (is (str/includes? (repr/generate-representation {:stats ts-stats}) "Time Series")))))

(deftest ^:parallel generate-representation-unknown-chart-type-fallback-test
  (testing "unknown chart type produces fallback message"
    (is (str/includes?
         (repr/generate-representation {:stats {:chart-type   :unknown
                                                :series-count 0
                                                :message      "Stats not yet implemented"}})
         "not yet implemented"))))
