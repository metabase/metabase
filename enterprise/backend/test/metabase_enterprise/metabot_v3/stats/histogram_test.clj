(ns metabase-enterprise.metabot-v3.stats.histogram-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.stats.histogram :as histogram]))

(set! *warn-on-reflection* true)

(deftest compute-series-stats-empty-test
  (testing "empty values returns zero counts"
    (is (=? {:data_points  0
             :distribution some?}
            (histogram/compute-series-stats [])))))

(deftest compute-series-stats-nil-filtered-test
  (testing "nil values are filtered out"
    (is (=? {:data_points 3}
            (histogram/compute-series-stats [10 nil 20 nil 30])))))

(deftest compute-series-stats-few-points-no-shape-test
  (testing "< 8 values produces no skewness or kurtosis"
    (is (=? {:data_points  7
             :distribution {:skewness (symbol "nil #_\"key is not present.\"")
                            :kurtosis (symbol "nil #_\"key is not present.\"")}}
            (histogram/compute-series-stats [1 2 3 4 5 6 7])))))

(deftest compute-series-stats-enough-points-has-shape-test
  (testing ">= 8 values produces skewness and kurtosis"
    (is (=? {:data_points  8
             :distribution {:skewness some? :kurtosis some?}}
            (histogram/compute-series-stats [1 2 3 4 5 6 7 8])))))

(deftest compute-series-stats-symmetric-skewness-test
  (testing "symmetric data has near-zero skewness"
    (is (=? {:distribution {:skewness #(< (Math/abs (double %)) 0.5)}}
            ;; perfectly symmetric: [1 2 3 4 5 6 7 8 9 10]
            (histogram/compute-series-stats (range 1 11))))))

(deftest compute-series-stats-right-skewed-test
  (testing "right-skewed data has positive skewness > 0.5"
    (is (=? {:distribution {:skewness #(> (double %) 0.5)}}
            ;; right skew: many small values, few large
            (histogram/compute-series-stats [1 1 1 1 1 2 2 2 3 4 5 100])))))

(deftest compute-series-stats-left-skewed-test
  (testing "left-skewed data has negative skewness < -0.5"
    (is (=? {:distribution {:skewness #(< (double %) -0.5)}}
            ;; left skew: many large values, few small
            (histogram/compute-series-stats [1 99 99 99 100 100 100 100 100 100 100 100])))))

(deftest compute-series-stats-percentiles-test
  (testing "P50 matches median from summary"
    ;; Use odd-length data so median is unambiguous (no interpolation difference)
    (let [values (range 1 12)
          result (histogram/compute-series-stats values)
          p50 (get-in result [:distribution :percentiles 50])
          median (:median (:summary result))]
      (is (some? p50))
      (is (< (Math/abs (- (double p50) (double median))) 0.01)))))

(deftest compute-series-stats-iqr-test
  (testing "IQR = Q3 - Q1"
    (let [result (histogram/compute-series-stats (range 1 11))
          quartiles (get-in result [:distribution :quartiles])
          {:keys [q1 q3 iqr]} quartiles]
      (is (< (Math/abs (- (double iqr) (- (double q3) (double q1)))) 0.001)))))

(deftest compute-histogram-stats-multi-series-test
  (testing "per-series structure with correct chart_type"
    (let [series-data {"Bins" {:x_values [0 1 2 3 4] :y_values [5 10 20 10 5]
                               :x {:name "bin" :type :number}
                               :y {:name "count" :type :number}
                               :display_name "Bins"}}]
      (is (=? {:chart_type   :histogram
               :series_count 1
               :series       {"Bins" {:data_points  5
                                      :summary      some?
                                      :distribution some?}}}
              (histogram/compute-histogram-stats series-data {}))))))

(deftest compute-series-stats-all-nil-test
  (testing "all-nil values returns zero data_points"
    (is (=? {:data_points  0
             :distribution some?}
            (histogram/compute-series-stats [nil nil nil])))))

(deftest compute-series-stats-all-percentiles-present-test
  (testing "all six percentiles (25,50,75,90,95,99) are computed"
    (let [result (histogram/compute-series-stats (range 1 101))
          pcts   (get-in result [:distribution :percentiles])]
      (is (contains? pcts 25))
      (is (contains? pcts 50))
      (is (contains? pcts 75))
      (is (contains? pcts 90))
      (is (contains? pcts 95))
      (is (contains? pcts 99))
      ;; Values should be in ascending order
      (is (< (get pcts 25) (get pcts 50)))
      (is (< (get pcts 50) (get pcts 75)))
      (is (< (get pcts 75) (get pcts 90))))))

(deftest compute-series-stats-uniform-kurtosis-test
  (testing "uniform distribution has negative excess kurtosis"
    (let [result (histogram/compute-series-stats (range 1 101))
          kurtosis (get-in result [:distribution :kurtosis])]
      (is (some? kurtosis))
      (is (< (double kurtosis) 0)))))

(deftest compute-series-stats-single-value-test
  (testing "single value: min = max = mean"
    (is (=? {:data_points 1
             :summary     {:min 42.0 :max 42.0 :mean 42.0}}
            (histogram/compute-series-stats [42])))))

(deftest compute-series-stats-all-same-values-test
  (testing "all identical values: std_dev = 0"
    (is (=? {:data_points 10
             :summary     {:min 50.0 :max 50.0 :std_dev 0.0}}
            (histogram/compute-series-stats [50 50 50 50 50 50 50 50 50 50])))))

(deftest compute-series-stats-float-values-test
  (testing "float values handled correctly"
    (is (=? {:data_points 5
             :summary     {:min 1.5 :max 5.5}}
            (histogram/compute-series-stats [1.5 2.5 3.5 4.5 5.5])))))

(deftest compute-series-stats-negative-values-test
  (testing "negative values handled correctly"
    (is (=? {:summary {:min -50.0 :max 50.0 :mean 0.0}}
            (histogram/compute-series-stats [-50 -25 0 25 50])))))
