(ns metabase-enterprise.metabot-v3.stats.histogram-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.stats.histogram :as histogram]
   [metabase-enterprise.metabot-v3.stats.repr :as repr]))

(set! *warn-on-reflection* true)

(deftest compute-series-stats-empty-test
  (testing "empty values returns zero counts without crashing"
    (let [result (histogram/compute-series-stats [])]
      (is (= 0 (:data_points result)))
      (is (some? (:distribution result))))))

(deftest compute-series-stats-nil-filtered-test
  (testing "nil values are filtered out"
    (let [result (histogram/compute-series-stats [10 nil 20 nil 30])]
      (is (= 3 (:data_points result))))))

(deftest compute-series-stats-few-points-no-shape-test
  (testing "< 8 values produces no skewness or kurtosis"
    (let [result (histogram/compute-series-stats [1 2 3 4 5 6 7])]
      (is (= 7 (:data_points result)))
      (is (nil? (get-in result [:distribution :skewness])))
      (is (nil? (get-in result [:distribution :kurtosis]))))))

(deftest compute-series-stats-enough-points-has-shape-test
  (testing ">= 8 values produces skewness and kurtosis"
    (let [result (histogram/compute-series-stats [1 2 3 4 5 6 7 8])]
      (is (= 8 (:data_points result)))
      (is (some? (get-in result [:distribution :skewness])))
      (is (some? (get-in result [:distribution :kurtosis]))))))

(deftest compute-series-stats-symmetric-skewness-test
  (testing "symmetric data has near-zero skewness"
    (let [;; perfectly symmetric: [1 2 3 4 5 6 7 8 9 10]
          result (histogram/compute-series-stats (range 1 11))
          skewness (get-in result [:distribution :skewness])]
      (is (some? skewness))
      (is (< (Math/abs (double skewness)) 0.5) "should be approximately symmetric"))))

(deftest compute-series-stats-right-skewed-test
  (testing "right-skewed data has positive skewness > 0.5"
    (let [;; right skew: many small values, few large
          values [1 1 1 1 1 2 2 2 3 4 5 100]
          result (histogram/compute-series-stats values)
          skewness (get-in result [:distribution :skewness])]
      (is (some? skewness))
      (is (> (double skewness) 0.5)))))

(deftest compute-series-stats-left-skewed-test
  (testing "left-skewed data has negative skewness < -0.5"
    (let [;; left skew: many large values, few small
          values [1 99 99 99 100 100 100 100 100 100 100 100]
          result (histogram/compute-series-stats values)
          skewness (get-in result [:distribution :skewness])]
      (is (some? skewness))
      (is (< (double skewness) -0.5)))))

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
                               :display_name "Bins"}}
          result (histogram/compute-histogram-stats series-data {})]
      (is (= :histogram (:chart_type result)))
      (is (= 1 (:series_count result)))
      (is (contains? (:series result) "Bins"))
      (let [s (get-in result [:series "Bins"])]
        (is (= 5 (:data_points s)))
        (is (some? (:summary s)))
        (is (some? (:distribution s)))))))

(deftest compute-series-stats-all-nil-test
  (testing "all-nil values returns zero data_points"
    (let [result (histogram/compute-series-stats [nil nil nil])]
      (is (= 0 (:data_points result)))
      (is (some? (:distribution result))))))

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
    (let [result  (histogram/compute-series-stats (range 1 101))
          kurtosis (get-in result [:distribution :kurtosis])]
      (is (some? kurtosis))
      (is (< (double kurtosis) 0)))))

(deftest compute-series-stats-no-outliers-field-test
  (testing "histogram stats do not include an outliers field"
    ;; Histograms show distribution, not individual point anomalies
    (let [result (histogram/compute-series-stats [10 20 30 40 50 1000])]
      (is (not (contains? result :outliers))))))

(deftest compute-series-stats-single-value-test
  (testing "single value: min = max = mean"
    (let [result (histogram/compute-series-stats [42])
          s      (:summary result)]
      (is (= 1 (:data_points result)))
      (is (some? s))
      (is (= 42.0 (:min s)))
      (is (= 42.0 (:max s)))
      (is (= 42.0 (:mean s))))))

(deftest compute-series-stats-all-same-values-test
  (testing "all identical values: std_dev = 0"
    (let [result (histogram/compute-series-stats [50 50 50 50 50 50 50 50 50 50])
          s      (:summary result)]
      (is (= 10 (:data_points result)))
      (is (= 50.0 (:min s)))
      (is (= 50.0 (:max s)))
      (is (= 0.0 (:std_dev s))))))

(deftest compute-series-stats-float-values-test
  (testing "float values handled correctly"
    (let [result (histogram/compute-series-stats [1.5 2.5 3.5 4.5 5.5])
          s      (:summary result)]
      (is (= 5 (:data_points result)))
      (is (< (Math/abs (- (:min s) 1.5)) 0.001))
      (is (< (Math/abs (- (:max s) 5.5)) 0.001)))))

(deftest compute-series-stats-negative-values-test
  (testing "negative values handled correctly"
    (let [result (histogram/compute-series-stats [-50 -25 0 25 50])
          s      (:summary result)]
      (is (= -50.0 (:min s)))
      (is (= 50.0 (:max s)))
      (is (= 0.0 (:mean s))))))

(deftest repr-histogram-shows-shape-test
  (testing "representation includes Distribution Shape when enough data"
    (let [series-stats (histogram/compute-series-stats (range 1 101))
          stats        {:chart_type   :histogram
                        :series_count 1
                        :series       {"Test Series" series-stats}}
          rep          (repr/generate-histogram-representation {:stats stats})]
      (is (str/includes? rep "Test Series"))
      (is (str/includes? rep "Distribution Shape")))))
