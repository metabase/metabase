(ns metabase-enterprise.metabot-v3.stats.scatter-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.stats.repr :as repr]
   [metabase-enterprise.metabot-v3.stats.scatter :as scatter]))

(set! *warn-on-reflection* true)

(deftest compute-series-stats-empty-test
  (testing "empty/nil series returns minimal result without crashing"
    (let [result (scatter/compute-series-stats [] [])]
      (is (= 0 (:data_points result)))
      (is (nil? (:x_summary result)))
      (is (nil? (:y_summary result))))))

(deftest compute-series-stats-nil-filtered-test
  (testing "nil x or y values are filtered out"
    (let [result (scatter/compute-series-stats [1 nil 3] [4 5 nil])]
      ;; only [1,4] is fully valid
      (is (= 1 (:data_points result))))))

(deftest compute-series-stats-one-valid-pair-test
  (testing "< 2 valid pairs gives no correlation or regression"
    (let [result (scatter/compute-series-stats [1] [2])]
      (is (= 1 (:data_points result)))
      (is (nil? (:correlation result)))
      (is (nil? (:regression result))))))

(deftest compute-series-stats-two-valid-pairs-test
  (testing "2 valid pairs gives correlation but no regression (< 3)"
    (let [result (scatter/compute-series-stats [1 2] [3 4])]
      (is (= 2 (:data_points result)))
      (is (some? (:correlation result)))
      (is (nil? (:regression result))))))

(deftest compute-series-stats-perfect-positive-correlation-test
  (testing "perfect positive correlation"
    (let [result (scatter/compute-series-stats [1 2 3 4 5] [2 4 6 8 10])
          corr   (:correlation result)
          reg    (:regression result)]
      (is (= 5 (:data_points result)))
      (is (some? corr))
      (is (== (:coefficient corr) 1.0))
      (is (= :strong (:strength corr)))
      (is (= :positive (:direction corr)))
      (is (some? reg))
      (is (== (:slope reg) 2.0))
      (is (== (:r_squared reg) 1.0)))))

(deftest compute-series-stats-perfect-negative-correlation-test
  (testing "perfect negative correlation"
    (let [result (scatter/compute-series-stats [1 2 3 4 5] [10 8 6 4 2])
          corr   (:correlation result)]
      (is (some? corr))
      (is (== (:coefficient corr) -1.0))
      (is (= :strong (:strength corr)))
      (is (= :negative (:direction corr))))))

(deftest compute-series-stats-weak-correlation-test
  (testing "uncorrelated data has weak strength"
    ;; y = [3 1 2 1 3] produces Pearson r = 0 with x = [1 2 3 4 5]
    (let [result (scatter/compute-series-stats [1 2 3 4 5] [3 1 2 1 3])]
      (when-let [corr (:correlation result)]
        (is (= :weak (:strength corr)))))))

(deftest compute-series-stats-moderate-correlation-test
  (testing "moderate correlation (0.3-0.7)"
    ;; y = x + noise roughly
    (let [result (scatter/compute-series-stats
                  [1 2 3 4 5 6 7 8]
                  [1.5 2.1 4.0 3.8 5.5 5.1 7.2 6.9])
          corr   (:correlation result)]
      (is (some? corr))
      (is (#{:moderate :strong} (:strength corr))))))

(deftest compute-series-stats-constant-x-test
  (testing "constant x-values result in regression returning nil gracefully"
    (let [result (scatter/compute-series-stats [5 5 5 5] [1 2 3 4])]
      ;; correlation will be NaN (constant x), regression may fail
      (is (= 4 (:data_points result)))
      ;; should not throw
      (is (map? result)))))

(deftest compute-series-stats-summaries-test
  (testing "x and y summaries computed correctly"
    (let [result (scatter/compute-series-stats [1 2 3] [10 20 30])
          xs     (:x_summary result)
          ys     (:y_summary result)]
      (is (= 1.0 (:min xs)))
      (is (= 3.0 (:max xs)))
      (is (= 10.0 (:min ys)))
      (is (= 30.0 (:max ys))))))

(deftest compute-scatter-stats-multi-series-test
  (testing "each series gets independent stats; no cross-series correlations"
    (let [series-data {"S1" {:x_values [1 2 3] :y_values [4 5 6]
                             :x {:name "x" :type :number}
                             :y {:name "y" :type :number}
                             :display_name "S1"}
                       "S2" {:x_values [1 2 3] :y_values [6 5 4]
                             :x {:name "x" :type :number}
                             :y {:name "y" :type :number}
                             :display_name "S2"}}
          result (scatter/compute-scatter-stats series-data {})]
      (is (= :scatter (:chart_type result)))
      (is (= 2 (:series_count result)))
      (is (contains? (:series result) "S1"))
      (is (contains? (:series result) "S2"))
      ;; No cross-series correlations key
      (is (nil? (:correlations result))))))

(deftest compute-series-stats-regression-intercept-test
  (testing "regression intercept computed correctly for y = 2x + 10"
    (let [result (scatter/compute-series-stats [1 2 3 4 5] [12 14 16 18 20])
          reg    (:regression result)]
      (is (some? reg))
      (is (< (Math/abs (- (:slope reg) 2.0)) 0.001))
      (is (< (Math/abs (- (:intercept reg) 10.0)) 0.001))
      (is (< (Math/abs (- (:r_squared reg) 1.0)) 0.001)))))

(deftest compute-series-stats-constant-y-test
  (testing "constant y-values: NaN correlation is handled gracefully (nil correlation)"
    (let [result (scatter/compute-series-stats [1 2 3 4 5] [50 50 50 50 50])]
      (is (= 5 (:data_points result)))
      ;; Y has no variance; correlation is NaN, should be nil
      (is (nil? (:correlation result))))))

(deftest compute-series-stats-float-values-test
  (testing "float x and y values handled correctly"
    (let [result (scatter/compute-series-stats
                  [1.5 2.5 3.5 4.5 5.5]
                  [10.1 20.2 30.3 40.4 50.5])
          xs     (:x_summary result)
          ys     (:y_summary result)]
      (is (= 5 (:data_points result)))
      (is (< (Math/abs (- (:min xs) 1.5)) 0.001))
      (is (< (Math/abs (- (:max xs) 5.5)) 0.001))
      (is (< (Math/abs (- (:min ys) 10.1)) 0.001))
      (is (< (Math/abs (- (:max ys) 50.5)) 0.001)))))

(deftest repr-scatter-shows-relationship-test
  (testing "representation includes Relationship with strength and direction"
    (let [series-stats (scatter/compute-series-stats [1 2 3 4 5] [10 20 30 40 50])
          stats        {:chart_type   :scatter
                        :series_count 1
                        :series       {"Test Series" series-stats}}
          rep          (repr/generate-scatter-representation {:stats stats})]
      (is (str/includes? rep "Test Series"))
      (is (str/includes? rep "Relationship"))
      (is (str/includes? rep "strong positive")))))
