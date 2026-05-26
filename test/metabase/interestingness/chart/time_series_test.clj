(ns metabase.interestingness.chart.time-series-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.interestingness.chart.time-series :as time-series]
   [metabase.interestingness.chart.util :as stats.u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ detect-cumulative? ----------------------------------------------

(deftest ^:parallel detect-cumulative-strictly-increasing-test
  (testing "strictly increasing data is cumulative"
    (is (true? (#'time-series/detect-cumulative? [10.0 20.0 30.0 40.0 50.0 60.0])))))

(deftest ^:parallel detect-cumulative-monotone-with-plateaus-test
  (testing "monotone non-decreasing data with flat sections is cumulative"
    (is (true? (#'time-series/detect-cumulative? [100.0 100.0 150.0 150.0 200.0 200.0 250.0])))))

(deftest ^:parallel detect-cumulative-not-cumulative-test
  (testing "data with frequent decreases is not cumulative"
    (is (false? (#'time-series/detect-cumulative? [1.0 2.0 1.5 3.0 2.8])))))

(deftest ^:parallel detect-cumulative-multiple-significant-decreases-test
  (testing "data with many significant drops is not cumulative"
    (is (false? (#'time-series/detect-cumulative? [100.0 90.0 120.0 100.0 150.0 130.0 180.0])))))

(deftest ^:parallel detect-cumulative-single-value-test
  (testing "single value has no diffs → not cumulative"
    (is (false? (#'time-series/detect-cumulative? [100.0])))))

(deftest ^:parallel detect-cumulative-empty-test
  (testing "empty values are not cumulative"
    (is (false? (#'time-series/detect-cumulative? [])))))

(deftest ^:parallel detect-cumulative-mostly-increasing-with-significant-drop-test
  (testing "data where >5% of consecutive diffs are negative is not cumulative"
    (is (false? (#'time-series/detect-cumulative? [1.0 2.0 3.0 2.9 4.0 5.0])))))

;;; ---------------------------------------------- compute-trend tests -----------------------------------------------

(deftest ^:parallel compute-trend-strongly-increasing-test
  (testing "strongly increasing series detected as :strongly-increasing"
    ;; slope=5, mean=20, pct=100*20/20=100% > 50 → :strongly-increasing
    (is (=? {:direction          :strongly-increasing
             :overall-change-pct pos?
             :start-value        10.0
             :end-value          30.0}
            (#'time-series/compute-trend [10.0 15.0 20.0 25.0 30.0])))))

(deftest ^:parallel compute-trend-strongly-decreasing-test
  (testing "strongly decreasing series detected as :strongly-decreasing"
    (is (=? {:direction          :strongly-decreasing
             :overall-change-pct neg?}
            (#'time-series/compute-trend [100.0 80.0 60.0 40.0 20.0])))))

(deftest ^:parallel compute-trend-flat-test
  (testing "roughly flat series detected as :flat"
    (is (=? {:direction :flat}
            (#'time-series/compute-trend [50.0 51.0 50.0 50.5 50.0])))))

(deftest ^:parallel compute-trend-increasing-moderate-test
  (testing "moderate increase (10-50% range) detected as :increasing"
    ;; slope=10, mean=120, total_change=40, pct=33.3% → :increasing
    (is (=? {:direction :increasing}
            (#'time-series/compute-trend [100.0 110.0 120.0 130.0 140.0])))))

(deftest ^:parallel compute-trend-returns-start-end-values-test
  (testing "trend includes correct start and end values"
    (is (=? {:start-value 5.0
             :end-value   25.0}
            (#'time-series/compute-trend [5.0 10.0 15.0 20.0 25.0])))))

;;; --------------------------------------------- compute-volatility tests -------------------------------------------

(deftest ^:parallel compute-volatility-low-test
  (testing "tightly clustered values produce :low volatility (cv < 0.1)"
    ;; mean≈101.6, std≈1.1, cv≈0.011
    (is (=? {:level                    :low
             :coefficient-of-variation #(< % 0.1)}
            (#'time-series/compute-volatility [100.0 102.0 101.0 103.0 102.0])))))

(deftest ^:parallel compute-volatility-moderate-test
  (testing "moderately variable data produces :moderate volatility (0.1 ≤ cv < 0.3)"
    ;; mean=100, std≈17.3, cv≈0.173
    (is (=? {:level                    :moderate
             :coefficient-of-variation #(and (<= 0.1 %) (< % 0.3))}
            (#'time-series/compute-volatility [80.0 100.0 120.0 90.0 110.0])))))

(deftest ^:parallel compute-volatility-high-test
  (testing "fairly variable data produces :high volatility (0.3 ≤ cv < 0.5)"
    ;; mean=100, std≈34.6, cv≈0.346
    (is (=? {:level                    :high
             :coefficient-of-variation #(and (<= 0.3 %) (< % 0.5))}
            (#'time-series/compute-volatility [60.0 100.0 140.0 70.0 130.0])))))

(deftest ^:parallel compute-volatility-extreme-test
  (testing "very variable data produces :extreme volatility (cv ≥ 0.5)"
    ;; mean≈102, std≈75, cv≈0.73
    (is (=? {:level                    :extreme
             :coefficient-of-variation #(>= % 0.5)}
            (#'time-series/compute-volatility [10.0 100.0 200.0 50.0 150.0])))))

(deftest ^:parallel compute-volatility-max-period-change-test
  (testing "max period change is computed as absolute percentage of previous value"
    ;; changes 100%, 25%, 100% → max = 100%
    (is (=? {:max-period-change-pct #(and (>= % 99.0) (<= % 101.0))}
            (#'time-series/compute-volatility [100.0 200.0 250.0 500.0])))))

;;; ----------------------------------------------- detect-patterns tests --------------------------------------------

(deftest ^:parallel detect-patterns-increasing-streak-test
  (testing "detects consecutive increases of 5+ periods"
    (let [values (mapv #(* 10.0 %) (range 1 11))  ; [10 20 ... 100]
          dates  (mapv #(format "2024-%02d" %) (range 1 11))
          result (#'time-series/detect-patterns values dates)]
      (is (pos? (count result)))
      (is (=? {:type        :consecutive-increase
               :description #(str/includes? % "increase")}
              (first result))))))

(deftest ^:parallel detect-patterns-decreasing-streak-test
  (testing "detects consecutive decreases of 5+ periods"
    (let [values (mapv #(* 10.0 %) (range 10 0 -1))  ; [100 90 ... 10]
          dates  (mapv #(format "2024-%02d" %) (range 1 11))
          result (#'time-series/detect-patterns values dates)]
      (is (pos? (count result)))
      (is (=? {:type        :consecutive-decrease
               :description #(str/includes? % "decrease")}
              (first result))))))

(deftest ^:parallel detect-patterns-short-sequence-no-streak-test
  (testing "fewer than 5 consecutive changes → no streak detected"
    (let [values [10.0 20.0 30.0]
          dates  ["2024-01" "2024-02" "2024-03"]
          result (#'time-series/detect-patterns values dates)]
      (is (empty? result)))))

(deftest ^:parallel detect-patterns-insufficient-data-test
  (testing "only 2 data points → no streaks possible"
    (let [values [10.0 20.0]
          dates  ["2024-01" "2024-02"]
          result (#'time-series/detect-patterns values dates)]
      (is (empty? result)))))

(deftest ^:parallel detect-patterns-includes-date-range-test
  (testing "pattern maps include :from-date and :to-date"
    (let [values (mapv #(* 10.0 %) (range 1 11))
          dates  (mapv #(format "2024-%02d" %) (range 1 11))
          result (#'time-series/detect-patterns values dates)]
      (is (=? [{:type      :consecutive-increase
                :from-date "2024-02"
                :to-date   "2024-10"}]
              result)))))

;;; ------------------------------------------- compute-correlations tests -------------------------------------------

(defn- make-corr-series
  "Build a series config with the required schema keys for compute-correlations."
  [display-name x-vals y-vals]
  {:x_values     x-vals
   :y_values     y-vals
   :x            {:name "x" :type "string"}
   :y            {:name "y" :type "number"}
   :display_name display-name})

(deftest ^:parallel compute-correlations-strong-positive-test
  (testing "perfectly correlated series produces strong positive correlation"
    ;; Requires ≥ 10 aligned data points
    (let [n       10
          x-vals  (mapv str (range 1 (inc n)))
          series-map {"Revenue" (make-corr-series "Revenue" x-vals (mapv #(* 10.0 %) (range 1 (inc n))))
                      "Sales"   (make-corr-series "Sales" x-vals (mapv #(* 20.0 %) (range 1 (inc n))))}
          result  (#'stats.u/compute-correlations series-map)]
      (is (= 1 (count result)))
      ;; "Revenue" < "Sales" alphabetically → series-a="Revenue", series-b="Sales"
      (is (=? {:series-a    "Revenue"
               :series-b    "Sales"
               :coefficient #(> % 0.9)
               :strength    :strong
               :direction   :positive}
              (first result))))))

(deftest ^:parallel compute-correlations-strong-negative-test
  (testing "inversely correlated series produces strong negative correlation"
    (let [n      10
          x-vals (mapv str (range 1 (inc n)))
          series-map {"Costs" (make-corr-series "Costs" x-vals (mapv #(* 10.0 %) (range 1 (inc n))))
                      "Sales" (make-corr-series "Sales" x-vals (mapv #(* 10.0 %) (range (inc n) 0 -1)))}
          result (#'stats.u/compute-correlations series-map)]
      (is (= 1 (count result)))
      (is (=? {:coefficient #(< % -0.9)
               :strength    :strong
               :direction   :negative}
              (first result))))))

(deftest ^:parallel compute-correlations-single-series-returns-empty-test
  (testing "single series produces no pairs → empty result"
    (let [n      10
          x-vals (mapv str (range 1 (inc n)))
          series-map {"Sales" (make-corr-series "Sales" x-vals (mapv #(* 10.0 %) (range 1 (inc n))))}
          result (#'stats.u/compute-correlations series-map)]
      (is (empty? result)))))

(deftest ^:parallel compute-correlations-three-series-all-pairs-test
  (testing "three series with 10 points each produces 3 pairs"
    (let [n      10
          x-vals (mapv str (range 1 (inc n)))
          vals   (mapv #(* 10.0 %) (range 1 (inc n)))
          series-map {"A" (make-corr-series "A" x-vals vals)
                      "B" (make-corr-series "B" x-vals vals)
                      "C" (make-corr-series "C" x-vals vals)}
          result (#'stats.u/compute-correlations series-map)]
      (is (= 3 (count result))))))

(deftest ^:parallel compute-correlations-insufficient-points-skipped-test
  (testing "pairs with fewer than 10 aligned points are skipped"
    ;; Only 5 aligned points → below min-correlation-sample-size (10) → no correlations
    (let [x-vals (mapv str (range 1 6))
          series-map {"A" (make-corr-series "A" x-vals [1.0 2.0 3.0 4.0 5.0])
                      "B" (make-corr-series "B" x-vals [2.0 4.0 6.0 8.0 10.0])}
          result (#'stats.u/compute-correlations series-map)]
      (is (empty? result)))))

;;; ----------------------------------------- find-significant-changes tests -----------------------------------------

(deftest ^:parallel find-significant-changes-top-n-by-magnitude-test
  (testing "returns top N changes sorted by absolute magnitude"
    ;; Changes: 10→15 (+5), 15→12 (-3), 12→25 (+13), 25→22 (-3), 22→20 (-2)
    ;; Top 3 by |abs|: 12→25 (13), 10→15 (5), 15→12 or 25→22 (3)
    (let [values [10.0 15.0 12.0 25.0 22.0 20.0]
          dates  ["d1" "d2" "d3" "d4" "d5" "d6"]
          result (#'time-series/find-significant-changes values dates 3)]
      (is (<= (count result) 3))
      ;; Largest change is 12→25 (abs=13)
      (is (=? {:from-value 12.0
               :to-value   25.0}
              (first result))))))

(deftest ^:parallel find-significant-changes-includes-pct-change-test
  (testing "change maps include :change_abs and :change_pct"
    (let [values [10.0 15.0 20.0]
          dates  ["d1" "d2" "d3"]
          result (#'time-series/find-significant-changes values dates 3)]
      (is (=? [{:from-date  "d1"
                :to-date    "d2"
                :from-value 10.0
                :to-value   15.0
                :change-abs 5.0
                :change-pct 50.0}
               {:from-date  "d2"
                :to-date    "d3"
                :from-value 15.0
                :to-value   20.0
                :change-abs 5.0
                :change-pct (=?/approx [33.33 0.01])}]
              result)))))

;;; ---------------------------------------- compute-most-recent-change tests ----------------------------------------

(deftest ^:parallel compute-most-recent-change-test
  (testing "returns the last consecutive change"
    (is (=? {:from-date  "2024-05"
             :to-date    "2024-06"
             :from-value 22.0
             :to-value   20.0
             :change-abs -2.0}
            (#'time-series/compute-most-recent-change
             [10.0 15.0 12.0 25.0 22.0 20.0]
             ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05" "2024-06"])))))

(deftest ^:parallel compute-most-recent-change-single-value-test
  (testing "single value returns nil (no previous point)"
    (is (nil? (#'time-series/compute-most-recent-change [10.0] ["d1"])))))

(deftest ^:parallel compute-most-recent-change-two-values-test
  (testing "two values returns the one change"
    (is (=? {:from-value 10.0
             :to-value   15.0
             :change-abs 5.0
             :change-pct (=?/approx [50.0 0.001])}
            (#'time-series/compute-most-recent-change [10.0 15.0] ["d1" "d2"])))))

;;; --------------------------------------------- compute-series-stats tests ----------------------------------------

(deftest ^:parallel compute-series-stats-basic-fields-test
  (testing "basic stats include summary, time-range, trend, data-points, is-cumulative"
    (is (=? {:data-points   5
             :summary       {:min 10.0 :max 50.0}
             :trend         {:direction          :strongly-increasing
                             :overall-change-pct 400.0
                             :start-value        10.0
                             :end-value          50.0}
             :time-range    {:start "2024-01"
                             :end   "2024-05"}
             :is-cumulative true}
            (#'time-series/compute-series-stats
             [10.0 20.0 30.0 40.0 50.0]
             ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05"]
             {})))))

(deftest ^:parallel compute-series-stats-cumulative-detection-test
  (testing "cumulative data is flagged as :is-cumulative true"
    (is (=? {:is-cumulative true}
            (#'time-series/compute-series-stats
             (mapv #(* 10.0 %) (range 1 13))
             (mapv #(format "2024-%02d" %) (range 1 13))
             {})))))

(deftest ^:parallel compute-series-stats-non-cumulative-detection-test
  (testing "non-cumulative data is flagged as :is-cumulative false"
    (is (=? {:is-cumulative false}
            (#'time-series/compute-series-stats
             [10.0 5.0 15.0 8.0 20.0]
             ["d1" "d2" "d3" "d4" "d5"]
             {})))))

(deftest ^:parallel compute-series-stats-no-deep-stats-by-default-test
  (testing "without deep? opt, volatility and patterns are not computed"
    (is (=? {:volatility          (symbol "nil #_\"key is not present.\"")
             :patterns            (symbol "nil #_\"key is not present.\"")
             :significant-changes (symbol "nil #_\"key is not present.\"")}
            (#'time-series/compute-series-stats
             (mapv #(* 10.0 %) (range 1 13))
             (mapv #(format "2024-%02d" %) (range 1 13))
             {})))))

(deftest ^:parallel compute-series-stats-deep-stats-with-opt-test
  (testing "with deep? true, volatility and patterns are computed"
    (is (=? {:volatility          {:level                    :extreme
                                   :coefficient-of-variation #(> % 0.5)
                                   :max-period-change-pct    100.0}
             :patterns            [{:type      :consecutive-increase
                                    :from-date "2024-02"
                                    :to-date   "2024-12"}]
             :significant-changes #(= 3 (count %))
             :most-recent-change  {:from-date  "2024-11"
                                   :to-date    "2024-12"
                                   :from-value 110.0
                                   :to-value   120.0
                                   :change-abs 10.0
                                   :change-pct (=?/approx [9.09 0.01])}}
            (#'time-series/compute-series-stats
             (mapv #(* 10.0 %) (range 1 13))
             (mapv #(format "2024-%02d" %) (range 1 13))
             {:deep? true})))))

(deftest ^:parallel compute-series-stats-deep-significant-changes-capped-at-3-test
  (testing "significant_changes contains at most 3 entries"
    (let [result (#'time-series/compute-series-stats
                  [10.0 15.0 12.0 25.0 22.0 20.0]
                  ["2024-01" "2024-02" "2024-03" "2024-04" "2024-05" "2024-06"]
                  {:deep? true})]
      (is (<= (count (:significant-changes result)) 3))
      (is (=? {:most-recent-change {:from-date "2024-05"
                                    :to-date   "2024-06"}}
              result)))))

;;; ----------------------------------------- compute-time-series-stats tests ----------------------------------------

(deftest ^:parallel compute-time-series-stats-multi-series-test
  (testing "each series gets independent stats; no cross-series correlations without deep?"
    (let [series-data {"S1" {:x_values ["d1" "d2" "d3" "d4" "d5"]
                             :y_values [1.0 2.0 3.0 4.0 5.0]
                             :x {:name "x" :type "string"}
                             :y {:name "y" :type "number"}
                             :display_name "S1"}
                       "S2" {:x_values ["d1" "d2" "d3" "d4" "d5"]
                             :y_values [5.0 4.0 3.0 2.0 1.0]
                             :x {:name "x" :type "string"}
                             :y {:name "y" :type "number"}
                             :display_name "S2"}}]
      (is (=? {:chart-type    :time-series
               :series-count  2
               :series        {"S1" {:data-points 5
                                     :trend {:direction :strongly-increasing}}
                               "S2" {:data-points 5
                                     :trend {:direction :strongly-decreasing}}}
               :correlations  (symbol "nil #_\"key is not present.\"")}
              (time-series/compute-time-series-stats series-data {}))))))

(deftest ^:parallel compute-time-series-stats-deep-correlations-test
  (testing "with deep? true and 2+ series of 10+ points, correlations are computed"
    (let [n           10
          x-vals      (mapv #(format "2024-%02d" %) (range 1 (inc n)))
          series-data {"A" {:x_values x-vals
                            :y_values (mapv #(* 10.0 %) (range 1 (inc n)))
                            :x {:name "x" :type "string"}
                            :y {:name "y" :type "number"}
                            :display_name "A"}
                       "B" {:x_values x-vals
                            :y_values (mapv #(* 20.0 %) (range 1 (inc n)))
                            :x {:name "x" :type "string"}
                            :y {:name "y" :type "number"}
                            :display_name "B"}}
          result (time-series/compute-time-series-stats series-data {:deep? true})]
      (is (=? {:correlations #(= 1 (count %))}
              result)))))
