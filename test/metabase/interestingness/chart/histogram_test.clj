(ns metabase.interestingness.chart.histogram-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.interestingness.chart.histogram :as histogram]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Empty / Edge Cases ------------------------------------------------

(deftest ^:parallel compute-series-stats-empty-test
  (testing "empty values returns zero counts"
    (is (=? {:data-points   0
             :total-count   0
             :distribution  {:estimated-percentiles empty?
                             :estimated-quartiles   {:q1 0 :median 0 :q3 0 :iqr 0}}
             :structure     {:mode-bin nil :peak-count 0 :bin-count 0}}
            (#'histogram/compute-series-stats [])))))

(deftest ^:parallel compute-series-stats-all-nil-test
  (testing "all-nil values returns zero data_points"
    (is (=? {:data-points   0
             :total-count   0
             :distribution  {:estimated-percentiles empty?
                             :estimated-quartiles   {:q1 0 :median 0 :q3 0 :iqr 0}}}
            (#'histogram/compute-series-stats [nil nil nil])))))

(deftest ^:parallel compute-series-stats-nil-filtered-test
  (testing "nil values are filtered out"
    (is (=? {:data-points 3}
            (#'histogram/compute-series-stats [0 1 2 3 4] [10 nil 20 nil 30])))))

;;; ------------------------------------------- Weighted Summary Stats ------------------------------------------------

(deftest ^:parallel weighted-mean-test
  (testing "weighted mean for symmetric histogram centered at 20"
    ;; bins at 0,10,20,30,40 with counts 5,10,20,10,5 → weighted mean = 20
    (is (=? {:estimated-summary {:weighted-mean (=?/approx [20.0 0.001])}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel weighted-std-dev-test
  (testing "weighted std dev for known data"
    ;; variance = Σ(c*(x-20)²)/50 = (5*400+10*100+0+10*100+5*400)/50 = 120
    ;; std = √120 ≈ 10.954
    (is (=? {:estimated-summary {:weighted-std-dev (=?/approx [10.954 0.01])}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel data-range-test
  (testing "data range is max_x - min_x"
    (is (=? {:estimated-summary {:data-range 40.0}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel total-count-test
  (testing "total_count is sum of all counts"
    (is (=? {:total-count 50}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

;;; ----------------------------------------- Estimated Percentiles ---------------------------------------------------

(deftest ^:parallel estimated-percentiles-present-test
  (testing "all six percentiles (25,50,75,90,95,99) are computed"
    (let [result (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])
          pcts   (get-in result [:distribution :estimated-percentiles])]
      (is (contains? pcts 25))
      (is (contains? pcts 50))
      (is (contains? pcts 75))
      (is (contains? pcts 90))
      (is (contains? pcts 95))
      (is (contains? pcts 99)))))

(deftest ^:parallel estimated-percentiles-ascending-test
  (testing "percentile values are in ascending order"
    (let [pcts (get-in (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])
                       [:distribution :estimated-percentiles])]
      (is (<= (get pcts 25) (get pcts 50)))
      (is (<= (get pcts 50) (get pcts 75)))
      (is (<= (get pcts 75) (get pcts 90))))))

(deftest ^:parallel estimated-percentiles-symmetric-test
  (testing "P50 is close to weighted mean for symmetric distribution"
    (let [result (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])
          p50    (get-in result [:distribution :estimated-percentiles 50])
          wmean  (get-in result [:estimated-summary :weighted-mean])]
      ;; For symmetric binned data, P50 should be reasonably close to the mean
      (is (< (Math/abs (double (- p50 wmean))) 10.0)))))

(deftest ^:parallel estimated-quartiles-iqr-test
  (testing "IQR = Q3 - Q1"
    (let [quartiles (get-in (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])
                            [:distribution :estimated-quartiles])
          {:keys [q1 q3 iqr]} quartiles]
      (is (< (Math/abs (- (double iqr) (- (double q3) (double q1)))) 0.001)))))

;;; --------------------------------------------- Weighted Skewness/Kurtosis ------------------------------------------

(deftest ^:parallel no-shape-metrics-few-bins-test
  (testing "< 8 bins produces no weighted_skewness or weighted_kurtosis"
    (is (=? {:data-points  5
             :distribution {:weighted-skewness (symbol "nil #_\"key is not present.\"")
                            :weighted-kurtosis (symbol "nil #_\"key is not present.\"")}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel shape-metrics-enough-bins-test
  (testing ">= 8 bins produces weighted_skewness and weighted_kurtosis"
    (let [xs (range 0 80 10)
          ys [2 5 10 20 20 10 5 2]]
      (is (=? {:data-points  8
               :distribution {:weighted-skewness number?
                              :weighted-kurtosis number?}}
              (#'histogram/compute-series-stats xs ys))))))

(deftest ^:parallel symmetric-distribution-skewness-test
  (testing "symmetric distribution has near-zero weighted skewness"
    (let [xs (range 0 100 10)
          ys [1 3 8 15 25 25 15 8 3 1]]
      (is (=? {:distribution {:weighted-skewness #(< (Math/abs (double %)) 0.1)}}
              (#'histogram/compute-series-stats xs ys))))))

(deftest ^:parallel right-skewed-distribution-test
  (testing "right-skewed distribution has positive weighted skewness"
    (let [xs (range 0 100 10)
          ys [30 20 15 10 8 5 3 2 1 1]]
      (is (=? {:distribution {:weighted-skewness #(> (double %) 0.3)}}
              (#'histogram/compute-series-stats xs ys))))))

(deftest ^:parallel left-skewed-distribution-test
  (testing "left-skewed distribution has negative weighted skewness"
    (let [xs (range 0 100 10)
          ys [1 1 2 3 5 8 10 15 20 30]]
      (is (=? {:distribution {:weighted-skewness #(< (double %) -0.3)}}
              (#'histogram/compute-series-stats xs ys))))))

;;; ------------------------------------------- Structural Metrics ----------------------------------------------------

(deftest ^:parallel mode-bin-test
  (testing "mode_bin is the bin with the highest count"
    (is (=? {:structure {:mode-bin [20.0 20.0]}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel unimodal-peak-count-test
  (testing "unimodal histogram has peak_count = 1"
    (is (=? {:structure {:peak-count 1}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel bimodal-peak-count-test
  (testing "bimodal histogram has peak_count = 2"
    (is (=? {:structure {:peak-count 2}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [15 5 2 5 15])))))

(deftest ^:parallel concentration-top3-test
  (testing "concentration_top3 gives fraction of data in top 3 bins"
    ;; top 3 counts: 20, 10, 10 = 40 out of 50 = 0.8
    (is (=? {:structure {:concentration-top3 (=?/approx [0.8 0.001])}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel gap-count-test
  (testing "gaps are counted between non-zero bins"
    (is (=? {:structure {:gap-count 3}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [10 0 0 0 10])))))

(deftest ^:parallel no-gaps-test
  (testing "no gaps when all bins are non-zero"
    (is (=? {:structure {:gap-count 0}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [5 10 20 10 5])))))

(deftest ^:parallel empty-bin-ratio-test
  (testing "empty_bin_ratio tracks fraction of zero-count bins"
    (is (=? {:structure {:empty-bin-ratio (=?/approx [0.6 0.001])}}
            (#'histogram/compute-series-stats [0 10 20 30 40] [10 0 0 0 10])))))

;;; ---------------------------------------- Full Integration Test ----------------------------------------------------

(deftest ^:parallel compute-histogram-stats-multi-series-test
  (testing "per-series structure with correct chart_type"
    (let [series-data {"Bins" {:x_values [0 10 20 30 40]
                               :y_values [5 10 20 10 5]
                               :x {:name "bin" :type "number"}
                               :y {:name "count" :type "number"}
                               :display_name "Bins"}}]
      (is (=? {:chart-type   :histogram
               :series-count 1
               :series       {"Bins" {:data-points       5
                                      :total-count       50
                                      :estimated-summary {:weighted-mean (=?/approx [20.0 0.001])}
                                      :distribution      {:estimated-quartiles {:q1 number?
                                                                                :q3 number?
                                                                                :iqr number?}}
                                      :structure         {:mode-bin [20.0 20.0]
                                                          :peak-count 1
                                                          :bin-count 5}}}}
              (histogram/compute-histogram-stats series-data {}))))))

(deftest ^:parallel single-arity-uses-indices-test
  (testing "single-arity form uses sequential indices as x_values"
    (let [result (#'histogram/compute-series-stats [10 20 30])]
      (is (=? {:data-points       3
               :total-count       60
               :estimated-summary {:weighted-mean (=?/approx [1.333 0.01])}}
              result)))))
