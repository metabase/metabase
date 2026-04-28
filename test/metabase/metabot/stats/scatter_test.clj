(ns metabase.metabot.stats.scatter-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.metabot.stats.scatter :as scatter]))

(set! *warn-on-reflection* true)

(deftest ^:parallel compute-series-stats-empty-test
  (testing "empty/nil series returns minimal result"
    (is (=? {:data-points 0
             :x-summary nil?
             :y-summary nil?}
            (#'scatter/compute-series-stats [] [])))))

(deftest ^:parallel compute-series-stats-nil-filtered-test
  (testing "nil x or y values are filtered out"
    ;; only [1,4] is fully valid
    (is (=? {:data-points 1}
            (#'scatter/compute-series-stats [1 nil 3] [4 5 nil])))))

(deftest ^:parallel compute-series-stats-one-valid-pair-test
  (testing "< 2 valid pairs gives no correlation or regression"
    (is (=? {:data-points  1
             :correlation  (symbol "nil #_\"key is not present.\"")
             :regression   (symbol "nil #_\"key is not present.\"")}
            (#'scatter/compute-series-stats [1] [2])))))

(deftest ^:parallel compute-series-stats-two-valid-pairs-test
  (testing "2 valid pairs gives correlation but no regression (< 3)"
    (is (=? {:data-points 2
             :correlation {:coefficient 1.0 :strength :strong :direction :positive}
             :regression  (symbol "nil #_\"key is not present.\"")}
            (#'scatter/compute-series-stats [1 2] [3 4])))))

(deftest ^:parallel compute-series-stats-perfect-positive-correlation-test
  (testing "perfect positive correlation"
    (is (=? {:data-points 5
             :correlation {:coefficient 1.0 :strength :strong :direction :positive}
             :regression  {:slope 2.0 :r-squared 1.0}}
            (#'scatter/compute-series-stats [1 2 3 4 5] [2 4 6 8 10])))))

(deftest ^:parallel compute-series-stats-perfect-negative-correlation-test
  (testing "perfect negative correlation"
    (is (=? {:correlation {:coefficient -1.0
                           :strength :strong
                           :direction :negative}}
            (#'scatter/compute-series-stats [1 2 3 4 5] [10 8 6 4 2])))))

(deftest ^:parallel compute-series-stats-weak-correlation-test
  (testing "uncorrelated data has no correlation strength"
    ;; y = [3 1 2 1 3] produces Pearson r ≈ 0 with x = [1 2 3 4 5]
    (is (=? {:correlation {:strength :none}}
            (#'scatter/compute-series-stats [1 2 3 4 5] [3 1 2 1 3])))))

(deftest ^:parallel compute-series-stats-strong-correlation-test
  (testing "strong correlation (> 0.7)"
    (is (=? {:correlation {:strength :strong}}
            (#'scatter/compute-series-stats
             [1 2 3 4 5 6 7 8]
             [1.5 2.1 4.0 3.8 5.5 5.1 7.2 6.9])))))

(deftest ^:parallel compute-series-stats-constant-x-test
  (testing "constant x-values result in regression returning nil gracefully"
    ;; correlation will be NaN (constant x). regression may fail but should not throw.
    (is (=? {:data-points 4}
            (#'scatter/compute-series-stats [5 5 5 5] [1 2 3 4])))))

(deftest ^:parallel compute-series-stats-summaries-test
  (testing "x and y summaries computed correctly"
    (is (=? {:x-summary {:min 1.0 :max 3.0}
             :y-summary {:min 10.0 :max 30.0}}
            (#'scatter/compute-series-stats [1 2 3] [10 20 30])))))

(deftest ^:parallel compute-scatter-stats-multi-series-test
  (testing "each series gets independent stats; no cross-series correlations"
    (let [series-data {"S1" {:x_values [1 2 3] :y_values [4 5 6]
                             :x {:name "x" :type "number"}
                             :y {:name "y" :type "number"}
                             :display_name "S1"}
                       "S2" {:x_values [1 2 3] :y_values [6 5 4]
                             :x {:name "x" :type "number"}
                             :y {:name "y" :type "number"}
                             :display_name "S2"}}]
      (is (=? {:chart-type    :scatter
               :series-count  2
               :series        {"S1" {:data-points 3
                                     :correlation {:coefficient 1.0
                                                   :strength :strong
                                                   :direction :positive}}
                               "S2" {:data-points 3
                                     :correlation {:coefficient -1.0
                                                   :strength :strong
                                                   :direction :negative}}}
               :correlations  (symbol "nil #_\"key is not present.\"")}
              (scatter/compute-scatter-stats series-data {}))))))

(deftest ^:parallel compute-series-stats-regression-intercept-test
  (testing "regression intercept computed correctly for y = 2x + 10"
    (is (=? {:regression {:slope     (=?/approx [2.0 0.001])
                          :intercept (=?/approx [10.0 0.001])
                          :r-squared (=?/approx [1.0 0.001])}}
            (#'scatter/compute-series-stats [1 2 3 4 5] [12 14 16 18 20])))))

(deftest ^:parallel compute-series-stats-constant-y-test
  (testing "constant y-values: NaN correlation is handled gracefully (nil correlation)"
    ;; Y has no variance; correlation is NaN, should be absent
    (is (=? {:data-points  5
             :correlation  (symbol "nil #_\"key is not present.\"")}
            (#'scatter/compute-series-stats [1 2 3 4 5] [50 50 50 50 50])))))

(deftest ^:parallel compute-series-stats-float-values-test
  (testing "float x and y values handled correctly"
    (is (=? {:data-points 5
             :x-summary {:min (=?/approx [1.5 0.001])
                         :max (=?/approx [5.5 0.001])}
             :y-summary {:min (=?/approx [10.1 0.001])
                         :max (=?/approx [50.5 0.001])}}
            (#'scatter/compute-series-stats
             [1.5 2.5 3.5 4.5 5.5]
             [10.1 20.2 30.3 40.4 50.5])))))
