(ns metabase-enterprise.metabot-v3.stats.time-series-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.stats.repr :as repr]
   [metabase-enterprise.metabot-v3.stats.time-series :as time-series]
   [metabase-enterprise.metabot-v3.stats.util :as stats.u]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ detect-cumulative? ----------------------------------------------

(deftest detect-cumulative-strictly-increasing-test
  (testing "strictly increasing data is cumulative"
    (is (true? (time-series/detect-cumulative? [10.0 20.0 30.0 40.0 50.0 60.0])))))

(deftest detect-cumulative-monotone-with-plateaus-test
  (testing "monotone non-decreasing data with flat sections is cumulative"
    (is (true? (time-series/detect-cumulative? [100.0 100.0 150.0 150.0 200.0 200.0 250.0])))))

(deftest detect-cumulative-not-cumulative-test
  (testing "data with frequent decreases is not cumulative"
    (is (false? (time-series/detect-cumulative? [1.0 2.0 1.5 3.0 2.8])))))

(deftest detect-cumulative-multiple-significant-decreases-test
  (testing "data with many significant drops is not cumulative"
    (is (false? (time-series/detect-cumulative? [100.0 90.0 120.0 100.0 150.0 130.0 180.0])))))

(deftest detect-cumulative-single-value-test
  (testing "single value has no diffs → not cumulative"
    (is (false? (time-series/detect-cumulative? [100.0])))))

(deftest detect-cumulative-empty-test
  (testing "empty values are not cumulative"
    (is (false? (time-series/detect-cumulative? [])))))

(deftest detect-cumulative-mostly-increasing-with-significant-drop-test
  (testing "data where >5% of consecutive diffs are negative is not cumulative"
    ;; [1 2 3 2.9 4 5]: one decrease (3→2.9) out of 5 diffs = 20% → not cumulative
    (is (false? (time-series/detect-cumulative? [1.0 2.0 3.0 2.9 4.0 5.0])))))

;;; ---------------------------------------------- compute-trend tests -----------------------------------------------

(deftest compute-trend-strongly-increasing-test
  (testing "strongly increasing series detected as :strongly_increasing"
    ;; slope=5, mean=20, pct=100*20/20=100% > 50 → :strongly_increasing
    (let [result (time-series/compute-trend [10.0 15.0 20.0 25.0 30.0])]
      (is (= :strongly_increasing (:direction result)))
      (is (> (:overall_change_pct result) 0))
      (is (= 10.0 (:start_value result)))
      (is (= 30.0 (:end_value result))))))

(deftest compute-trend-strongly-decreasing-test
  (testing "strongly decreasing series detected as :strongly_decreasing"
    (let [result (time-series/compute-trend [100.0 80.0 60.0 40.0 20.0])]
      (is (= :strongly_decreasing (:direction result)))
      (is (< (:overall_change_pct result) 0)))))

(deftest compute-trend-flat-test
  (testing "roughly flat series detected as :flat"
    (let [result (time-series/compute-trend [50.0 51.0 50.0 50.5 50.0])]
      (is (= :flat (:direction result))))))

(deftest compute-trend-increasing-moderate-test
  (testing "moderate increase (10-50% range) detected as :increasing"
    ;; [100 110 120 130 140]: slope=10, mean=120, total_change=40, pct=33.3% → :increasing
    (let [result (time-series/compute-trend [100.0 110.0 120.0 130.0 140.0])]
      (is (= :increasing (:direction result))))))

(deftest compute-trend-returns-start-end-values-test
  (testing "trend includes correct start and end values"
    (let [result (time-series/compute-trend [5.0 10.0 15.0 20.0 25.0])]
      (is (= 5.0 (:start_value result)))
      (is (= 25.0 (:end_value result))))))

;;; --------------------------------------------- compute-volatility tests -------------------------------------------

(deftest compute-volatility-low-test
  (testing "tightly clustered values produce :low volatility (cv < 0.1)"
    ;; mean≈101.6, std≈1.1, cv≈0.011
    (let [result (time-series/compute-volatility [100.0 102.0 101.0 103.0 102.0])]
      (is (some? result))
      (is (= :low (:level result)))
      (is (< (:coefficient_of_variation result) 0.1)))))

(deftest compute-volatility-moderate-test
  (testing "moderately variable data produces :moderate volatility (0.1 ≤ cv < 0.3)"
    ;; mean=100, std≈17.3, cv≈0.173
    (let [result (time-series/compute-volatility [80.0 100.0 120.0 90.0 110.0])]
      (is (some? result))
      (is (= :moderate (:level result)))
      (is (<= 0.1 (:coefficient_of_variation result)))
      (is (< (:coefficient_of_variation result) 0.3)))))

(deftest compute-volatility-high-test
  (testing "fairly variable data produces :high volatility (0.3 ≤ cv < 0.5)"
    ;; mean=100, std≈34.6, cv≈0.346
    (let [result (time-series/compute-volatility [60.0 100.0 140.0 70.0 130.0])]
      (is (some? result))
      (is (= :high (:level result)))
      (is (<= 0.3 (:coefficient_of_variation result)))
      (is (< (:coefficient_of_variation result) 0.5)))))

(deftest compute-volatility-extreme-test
  (testing "very variable data produces :extreme volatility (cv ≥ 0.5)"
    ;; mean≈102, std≈75, cv≈0.73
    (let [result (time-series/compute-volatility [10.0 100.0 200.0 50.0 150.0])]
      (is (some? result))
      (is (= :extreme (:level result)))
      (is (>= (:coefficient_of_variation result) 0.5)))))

(deftest compute-volatility-max-period-change-test
  (testing "max period change is computed as absolute percentage of previous value"
    ;; [100, 200, 250, 500]: changes 100%, 25%, 100% → max = 100%
    (let [result (time-series/compute-volatility [100.0 200.0 250.0 500.0])]
      (is (some? result))
      (is (>= (:max_period_change_pct result) 99.0))
      (is (<= (:max_period_change_pct result) 101.0)))))

;;; ----------------------------------------------- detect-patterns tests --------------------------------------------

(deftest detect-patterns-increasing-streak-test
  (testing "detects consecutive increases of 5+ periods"
    (let [values (mapv #(* 10.0 %) (range 1 11))  ; [10 20 ... 100]
          dates  (mapv #(format "2024-%02d" %) (range 1 11))
          result (time-series/detect-patterns values dates)]
      (is (pos? (count result)))
      (is (= :consecutive_increase (:type (first result))))
      (is (str/includes? (:description (first result)) "increase")))))

(deftest detect-patterns-decreasing-streak-test
  (testing "detects consecutive decreases of 5+ periods"
    (let [values (mapv #(* 10.0 %) (range 10 0 -1))  ; [100 90 ... 10]
          dates  (mapv #(format "2024-%02d" %) (range 1 11))
          result (time-series/detect-patterns values dates)]
      (is (pos? (count result)))
      (is (= :consecutive_decrease (:type (first result))))
      (is (str/includes? (:description (first result)) "decrease")))))

(deftest detect-patterns-short-sequence-no-streak-test
  (testing "fewer than 5 consecutive changes → no streak detected"
    (let [values [10.0 20.0 30.0]
          dates  ["2024-01" "2024-02" "2024-03"]
          result (time-series/detect-patterns values dates)]
      (is (empty? result)))))

(deftest detect-patterns-insufficient-data-test
  (testing "only 2 data points → no streaks possible"
    (let [values [10.0 20.0]
          dates  ["2024-01" "2024-02"]
          result (time-series/detect-patterns values dates)]
      (is (empty? result)))))

(deftest detect-patterns-includes-date-range-test
  (testing "pattern maps include :from_date and :to_date"
    (let [values (mapv #(* 10.0 %) (range 1 11))
          dates  (mapv #(format "2024-%02d" %) (range 1 11))
          result (time-series/detect-patterns values dates)]
      (when (seq result)
        (let [pattern (first result)]
          (is (contains? pattern :from_date))
          (is (contains? pattern :to_date))
          (is (contains? pattern :description)))))))

;;; ------------------------------------------- compute-correlations tests -------------------------------------------

(deftest compute-correlations-strong-positive-test
  (testing "perfectly correlated series produces strong positive correlation"
    ;; Requires ≥ 10 aligned data points
    (let [n       10
          x-vals  (mapv str (range 1 (inc n)))
          series-map {"Revenue" {:x_values x-vals
                                 :y_values (mapv #(* 10.0 %) (range 1 (inc n)))}
                      "Sales"   {:x_values x-vals
                                 :y_values (mapv #(* 20.0 %) (range 1 (inc n)))}}
          result  (stats.u/compute-correlations series-map)]
      (is (= 1 (count result)))
      ;; "Revenue" < "Sales" alphabetically → series_a="Revenue", series_b="Sales"
      (is (= "Revenue" (:series_a (first result))))
      (is (= "Sales" (:series_b (first result))))
      (is (> (:coefficient (first result)) 0.9))
      (is (= :strong (:strength (first result))))
      (is (= :positive (:direction (first result)))))))

(deftest compute-correlations-strong-negative-test
  (testing "inversely correlated series produces strong negative correlation"
    (let [n      10
          x-vals (mapv str (range 1 (inc n)))
          series-map {"Costs" {:x_values x-vals
                               :y_values (mapv #(* 10.0 %) (range 1 (inc n)))}
                      "Sales" {:x_values x-vals
                               :y_values (mapv #(* 10.0 %) (range (inc n) 0 -1))}}
          result (stats.u/compute-correlations series-map)]
      (is (= 1 (count result)))
      (is (< (:coefficient (first result)) -0.9))
      (is (= :strong (:strength (first result))))
      (is (= :negative (:direction (first result)))))))

(deftest compute-correlations-single-series-returns-empty-test
  (testing "single series produces no pairs → empty result"
    (let [n      10
          x-vals (mapv str (range 1 (inc n)))
          series-map {"Sales" {:x_values x-vals
                               :y_values (mapv #(* 10.0 %) (range 1 (inc n)))}}
          result (stats.u/compute-correlations series-map)]
      (is (empty? result)))))

(deftest compute-correlations-three-series-all-pairs-test
  (testing "three series with 10 points each produces 3 pairs"
    (let [n      10
          x-vals (mapv str (range 1 (inc n)))
          vals   (mapv #(* 10.0 %) (range 1 (inc n)))
          series-map {"A" {:x_values x-vals :y_values vals}
                      "B" {:x_values x-vals :y_values vals}
                      "C" {:x_values x-vals :y_values vals}}
          result (stats.u/compute-correlations series-map)]
      (is (= 3 (count result))))))

(deftest compute-correlations-insufficient-points-skipped-test
  (testing "pairs with fewer than 10 aligned points are skipped"
    ;; Only 5 aligned points → below min-correlation-sample-size (10) → no correlations
    (let [x-vals (mapv str (range 1 6))
          series-map {"A" {:x_values x-vals :y_values [1.0 2.0 3.0 4.0 5.0]}
                      "B" {:x_values x-vals :y_values [2.0 4.0 6.0 8.0 10.0]}}
          result (stats.u/compute-correlations series-map)]
      (is (empty? result)))))

;;; ----------------------------------------- find-significant-changes tests -----------------------------------------

(deftest find-significant-changes-top-n-by-magnitude-test
  (testing "returns top N changes sorted by absolute magnitude"
    ;; Changes: 10→15 (+5), 15→12 (-3), 12→25 (+13), 25→22 (-3), 22→20 (-2)
    ;; Top 3 by |abs|: 12→25 (13), 10→15 (5), 15→12 or 25→22 (3)
    (let [values [10.0 15.0 12.0 25.0 22.0 20.0]
          dates  ["d1" "d2" "d3" "d4" "d5" "d6"]
          result (time-series/find-significant-changes values dates 3)]
      (is (<= (count result) 3))
      ;; Largest change is 12→25 (abs=13)
      (is (= 12.0 (:from_value (first result))))
      (is (= 25.0 (:to_value (first result)))))))

(deftest find-significant-changes-includes-pct-change-test
  (testing "change maps include :change_abs and :change_pct"
    (let [values [10.0 15.0 20.0]
          dates  ["d1" "d2" "d3"]
          result (time-series/find-significant-changes values dates 3)]
      (is (every? #(contains? % :change_abs) result))
      (is (every? #(contains? % :change_pct) result))
      (is (every? #(contains? % :from_date) result))
      (is (every? #(contains? % :to_date) result)))))

;;; ---------------------------------------- compute-most-recent-change tests ----------------------------------------

(deftest compute-most-recent-change-test
  (testing "returns the last consecutive change"
    (let [values [10.0 15.0 12.0 25.0 22.0 20.0]
          dates  ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05" "2024-06"]
          result (time-series/compute-most-recent-change values dates)]
      (is (some? result))
      (is (= "2024-05" (:from_date result)))
      (is (= "2024-06" (:to_date result)))
      (is (= 22.0 (:from_value result)))
      (is (= 20.0 (:to_value result)))
      (is (= -2.0 (:change_abs result))))))

(deftest compute-most-recent-change-single-value-test
  (testing "single value returns nil (no previous point)"
    (let [result (time-series/compute-most-recent-change [10.0] ["d1"])]
      (is (nil? result)))))

(deftest compute-most-recent-change-two-values-test
  (testing "two values returns the one change"
    (let [result (time-series/compute-most-recent-change [10.0 15.0] ["d1" "d2"])]
      (is (some? result))
      (is (= 10.0 (:from_value result)))
      (is (= 15.0 (:to_value result)))
      (is (= 5.0 (:change_abs result)))
      (is (< (Math/abs (- (:change_pct result) 50.0)) 0.001)))))

;;; --------------------------------------------- compute-series-stats tests ----------------------------------------

(deftest compute-series-stats-basic-fields-test
  (testing "basic stats include summary, time_range, trend, data_points, is_cumulative"
    (let [values [10.0 20.0 30.0 40.0 50.0]
          dates  ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05"]
          result (time-series/compute-series-stats values dates {})]
      (is (= 5 (:data_points result)))
      (is (some? (:summary result)))
      (is (= 10.0 (:min (:summary result))))
      (is (= 50.0 (:max (:summary result))))
      (is (some? (:trend result)))
      (is (some? (:time_range result)))
      (is (= "2024-01" (:start (:time_range result))))
      (is (= "2024-05" (:end (:time_range result)))))))

(deftest compute-series-stats-cumulative-detection-test
  (testing "cumulative data is flagged as :is_cumulative true"
    (let [values (mapv #(* 10.0 %) (range 1 13))   ; [10 20 ... 120]
          dates  (mapv #(format "2024-%02d" %) (range 1 13))
          result (time-series/compute-series-stats values dates {})]
      (is (true? (:is_cumulative result))))))

(deftest compute-series-stats-non-cumulative-detection-test
  (testing "non-cumulative data is flagged as :is_cumulative false"
    (let [values [10.0 5.0 15.0 8.0 20.0]
          dates  ["d1" "d2" "d3" "d4" "d5"]
          result (time-series/compute-series-stats values dates {})]
      (is (false? (:is_cumulative result))))))

(deftest compute-series-stats-no-deep-stats-by-default-test
  (testing "without deep? opt, volatility and patterns are not computed"
    (let [values (mapv #(* 10.0 %) (range 1 13))
          dates  (mapv #(format "2024-%02d" %) (range 1 13))
          result (time-series/compute-series-stats values dates {})]
      (is (nil? (:volatility result)))
      (is (nil? (:patterns result)))
      (is (nil? (:significant_changes result))))))

(deftest compute-series-stats-deep-stats-with-opt-test
  (testing "with deep? true, volatility and patterns are computed"
    (let [values (mapv #(* 10.0 %) (range 1 13))
          dates  (mapv #(format "2024-%02d" %) (range 1 13))
          result (time-series/compute-series-stats values dates {:deep? true})]
      (is (some? (:volatility result)))
      (is (some? (:patterns result)))
      (is (some? (:significant_changes result)))
      (is (some? (:most_recent_change result))))))

(deftest compute-series-stats-deep-significant-changes-capped-at-3-test
  (testing "significant_changes contains at most 3 entries"
    (let [values [10.0 15.0 12.0 25.0 22.0 20.0]
          dates  ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05" "2024-06"]
          result (time-series/compute-series-stats values dates {:deep? true})]
      (is (<= (count (:significant_changes result)) 3))
      (is (some? (:most_recent_change result)))
      (is (= "2024-05" (:from_date (:most_recent_change result))))
      (is (= "2024-06" (:to_date (:most_recent_change result)))))))

;;; ----------------------------------------- compute-time-series-stats tests ----------------------------------------

(deftest compute-time-series-stats-multi-series-test
  (testing "each series gets independent stats; no cross-series correlations without deep?"
    (let [series-data {"S1" {:x_values ["d1" "d2" "d3" "d4" "d5"]
                             :y_values [1.0 2.0 3.0 4.0 5.0]
                             :x {:name "x" :type :string}
                             :y {:name "y" :type :number}
                             :display_name "S1"}
                       "S2" {:x_values ["d1" "d2" "d3" "d4" "d5"]
                             :y_values [5.0 4.0 3.0 2.0 1.0]
                             :x {:name "x" :type :string}
                             :y {:name "y" :type :number}
                             :display_name "S2"}}
          result (time-series/compute-time-series-stats series-data {})]
      (is (= :time-series (:chart_type result)))
      (is (= 2 (:series_count result)))
      (is (contains? (:series result) "S1"))
      (is (contains? (:series result) "S2"))
      (is (nil? (:correlations result))))))

(deftest compute-time-series-stats-deep-correlations-test
  (testing "with deep? true and 2+ series of 10+ points, correlations are computed"
    (let [n           10
          x-vals      (mapv #(format "2024-%02d" %) (range 1 (inc n)))
          series-data {"A" {:x_values x-vals
                            :y_values (mapv #(* 10.0 %) (range 1 (inc n)))
                            :x {:name "x" :type :string}
                            :y {:name "y" :type :number}
                            :display_name "A"}
                       "B" {:x_values x-vals
                            :y_values (mapv #(* 20.0 %) (range 1 (inc n)))
                            :x {:name "x" :type :string}
                            :y {:name "y" :type :number}
                            :display_name "B"}}
          result (time-series/compute-time-series-stats series-data {:deep? true})]
      (is (some? (:correlations result)))
      (is (= 1 (count (:correlations result)))))))

;;; ---------------------------------------- temporal context / repr tests -------------------------------------------

(deftest generate-temporal-context-test
  (testing "temporal context includes current date, day of week, week, month, and quarter"
    (let [result (repr/generate-temporal-context)]
      (is (str/includes? result "Today is"))
      (is (some #(str/includes? result %)
                ["Monday" "Tuesday" "Wednesday" "Thursday" "Friday" "Saturday" "Sunday"]))
      (is (str/includes? (u/lower-case-en result) "week"))
      (is (str/includes? (u/lower-case-en result) "month"))
      (is (str/includes? (u/lower-case-en result) "quarter"))
      (is (some #(str/includes? result %) ["Q1" "Q2" "Q3" "Q4"])))))

(deftest repr-time-series-includes-series-name-and-trend-test
  (testing "time series representation includes series name and trend direction"
    (let [values [10.0 20.0 30.0 40.0 50.0]
          dates  ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05"]
          series-stats (time-series/compute-series-stats values dates {})
          stats {:chart_type   :time-series
                 :series_count 1
                 :series       {"Revenue" series-stats}}
          rep (repr/generate-time-series-representation {:stats stats})]
      (is (str/includes? rep "Revenue"))
      (is (str/includes? rep "Trend"))
      (is (str/includes? rep "Time Series")))))

(deftest repr-time-series-multi-series-test
  (testing "representation with multiple series includes all series names"
    (let [make-stats (fn [values dates]
                       (time-series/compute-series-stats values dates {}))
          stats {:chart_type   :time-series
                 :series_count 2
                 :series       {"Sales"   (make-stats [10.0 20.0 30.0 40.0 50.0]
                                                      ["d1" "d2" "d3" "d4" "d5"])
                                "Revenue" (make-stats [20.0 40.0 60.0 80.0 100.0]
                                                      ["d1" "d2" "d3" "d4" "d5"])}}
          rep (repr/generate-time-series-representation {:stats stats})]
      (is (str/includes? rep "Sales"))
      (is (str/includes? rep "Revenue")))))
