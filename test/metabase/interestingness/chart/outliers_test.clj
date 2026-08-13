(ns metabase.interestingness.chart.outliers-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.interestingness.chart.outliers :as outliers]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- find-outliers tests -----------------------------------------------

(deftest ^:parallel find-outliers-returns-detail-maps-test
  (testing "outlier maps contain index, label, value, and modified z-score"
    (let [values [1.0 2.0 2.1 2.2 10.0 1.9 2.3]
          labels ["A" "B" "C" "D" "E" "F" "G"]
          result (outliers/find-outliers values labels)]
      (is (seq result))
      (is (=? {:index 4
               :value 10.0
               :modified-z-score #(> (Math/abs (double %)) 3.0)}
              (first (filter #(= "E" (:label %)) result)))))))

(deftest ^:parallel find-outliers-no-outliers-returns-empty-test
  (testing "tightly clustered data produces no outliers"
    (let [values [10.0 11.0 10.5 10.2 10.8]
          labels ["A" "B" "C" "D" "E"]
          result (outliers/find-outliers values labels)]
      (is (empty? result)))))

(deftest ^:parallel find-outliers-empty-input-test
  (testing "empty values returns nil (MAD undefined)"
    (let [result (outliers/find-outliers [] [])]
      (is (nil? result)))))

(deftest ^:parallel find-outliers-single-value-returns-nil-test
  (testing "single value has no MAD and returns nil"
    (let [result (outliers/find-outliers [10.0] ["A"])]
      (is (nil? result)))))

(deftest ^:parallel find-outliers-mad-zero-returns-nil-test
  (testing "when all values are identical MAD is 0 → returns nil"
    (is (nil? (outliers/find-outliers [3.0 3.0 3.0 3.0 3.0] ["A" "B" "C" "D" "E"])))))

;;; ---------------------------------------- find-outliers-cumulative tests ------------------------------------------

(deftest ^:parallel find-outliers-cumulative-detects-unusual-jump-test
  (testing "sudden jump in cumulative diffs detected; outlier reported at destination point"
    ;; diffs=[1,1,7,2]; 7 is the outlier diff (modified-z ≈ 7.4 > 3.0)
    ;; destination point D (index 3) is flagged
    (let [values [1.0 2.0 3.0 10.0 12.0]
          labels ["A" "B" "C" "D" "E"]
          result (outliers/find-outliers-cumulative values labels)]
      (is (seq result))
      (is (some #(= "D" (:label %)) result)))))

(deftest ^:parallel find-outliers-cumulative-outlier-map-structure-test
  (testing "cumulative outlier maps include :index :label :value :diff :modified-z-score"
    (let [values [1.0 2.0 3.0 10.0 12.0]
          labels ["A" "B" "C" "D" "E"]
          result (outliers/find-outliers-cumulative values labels)]
      (is (seq result))
      (is (=? {:index 3
               :label "D"
               :value 10.0
               :diff 7.0
               :modified-z-score (=?/approx [3.37 0.01])}
              (first result))))))

(deftest ^:parallel find-outliers-cumulative-uniform-increments-test
  (testing "uniform diffs → MAD of diffs is 0 → returns nil"
    (let [values [10.0 20.0 30.0 40.0 50.0]
          labels ["A" "B" "C" "D" "E"]
          result (outliers/find-outliers-cumulative values labels)]
      (is (nil? result)))))

(deftest ^:parallel find-outliers-cumulative-destination-index-is-one-past-diff-index-test
  (testing "outlier point index is diff-index+1 (destination of unusual jump)"
    (let [values [1.0 2.0 3.0 10.0 12.0]
          labels ["A" "B" "C" "D" "E"]
          result (outliers/find-outliers-cumulative values labels)]
      ;; diff-index is 2 (the 3→10 transition), so point index is 3
      (is (=? {:index 3 :value 10.0}
              (first (filter #(= "D" (:label %)) result)))))))
