(ns metabase-enterprise.metabot-v3.tools.find-outliers-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.find-outliers :as find-outliers]))

;;; ------------------------------------------------ exact-median-test ------------------------------------------------

(deftest exact-median-test
  (testing "odd number of values → middle value"
    (is (= 3.0 (#'find-outliers/exact-median [1 3 5])))
    (is (= 5.0 (#'find-outliers/exact-median [1 2 5 8 9]))))

  (testing "even number of values → average of two middle values"
    (is (= 2.5 (#'find-outliers/exact-median [1 2 3 4])))
    (is (= 5.5 (#'find-outliers/exact-median [1 3 8 10]))))

  (testing "single value → that value"
    (is (= 42.0 (#'find-outliers/exact-median [42]))))

  (testing "negative values"
    (is (= -1.0 (#'find-outliers/exact-median [-5 -1 3])))
    (is (= 0.0 (#'find-outliers/exact-median [-10 -1 1 10]))))

  (testing "all same values"
    (is (= 7.0 (#'find-outliers/exact-median [7 7 7 7 7])))))

;;; ---------------------------------------- modified-z-score-outliers-test -------------------------------------------

(deftest modified-z-score-outliers-test
  (testing "normal data with one clear outlier → marks only the outlier"
    (let [values  [10 11 10 12 11 10 100]
          results (#'find-outliers/modified-z-score-outliers values)]
      (is (= 7 (count results)))
      ;; Only 100 should be an outlier
      (is (last results))
      (is (every? false? (butlast results)))))

  (testing "MAD=0 case (all same except one) → marks only the different one"
    (let [values  [5 5 5 5 5 99]
          results (#'find-outliers/modified-z-score-outliers values)]
      (is (= [false false false false false true] results))))

  (testing "no outliers in uniform-ish data → all false"
    (let [values  [10 11 10 11 10 11]
          results (#'find-outliers/modified-z-score-outliers values)]
      (is (every? false? results))))

  (testing "multiple outliers"
    (let [values  [10 11 10 11 10 200 -150]
          results (#'find-outliers/modified-z-score-outliers values)]
      ;; Both 200 and -150 should be outliers
      (is (nth results 5))
      (is (nth results 6))
      ;; The rest should not be
      (is (every? false? (take 5 results))))))

;;; ------------------------------------------- cumulative-data?-test ------------------------------------------------

(deftest cumulative-data?-test
  (testing "monotonically increasing → true"
    (is (true? (#'find-outliers/cumulative-data? [10 20 30 40 50]))))

  (testing "random/non-monotonic → false"
    (is (not (#'find-outliers/cumulative-data? [10 5 20 3 50 1]))))

  (testing "mostly increasing (>80% positive diffs) → true"
    ;; 5 diffs, 5 positive = 100% → cumulative
    (is (true? (#'find-outliers/cumulative-data? [1 2 3 4 5 6])))
    ;; 9 diffs: 8 positive, 1 negative = 88.9% → cumulative
    (is (true? (#'find-outliers/cumulative-data? [1 2 3 4 5 6 7 6 8 9]))))

  (testing "exactly at threshold boundary"
    ;; 5 diffs, 4 positive = 80% → exactly at threshold → cumulative
    (is (true? (#'find-outliers/cumulative-data? [1 2 3 4 3 5])))
    ;; 5 diffs, 3 positive = 60% → below threshold → not cumulative
    (is (not (#'find-outliers/cumulative-data? [1 2 3 2 1 3])))))

;;; --------------------------------------------- detect-outliers-test -----------------------------------------------

(deftest detect-outliers-test
  (testing "fewer than 5 values → empty"
    (is (= [] (#'find-outliers/detect-outliers [{:dimension 1 :value 10}
                                                {:dimension 2 :value 11}
                                                {:dimension 3 :value 12}])))
    (is (= [] (#'find-outliers/detect-outliers [{:dimension 1 :value 10}
                                                {:dimension 2 :value 11}
                                                {:dimension 3 :value 12}
                                                {:dimension 4 :value 100}]))))

  (testing "more than max-values → throws"
    ;; We can't realistically create 500k+ pairs, so let's rebind the limit
    (with-redefs [find-outliers/max-values 3]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Too many values to process"
           (#'find-outliers/detect-outliers [{:dimension 1 :value 1}
                                             {:dimension 2 :value 2}
                                             {:dimension 3 :value 3}
                                             {:dimension 4 :value 4}])))))

  (testing "non-cumulative data with outlier → finds it"
    (let [result (#'find-outliers/detect-outliers
                  [{:dimension 1 :value 10} {:dimension 2 :value 11}
                   {:dimension 3 :value 12} {:dimension 4 :value 10}
                   {:dimension 5 :value 100} {:dimension 6 :value 11}
                   {:dimension 7 :value 10}])]
      (is (= [{:dimension 5 :value 100}] result))))

  (testing "cumulative data with outlier in diffs → finds it"
    ;; Cumulative: 10 20 30 40 50 200 210
    ;; Diffs:      10 10 10 10 150 10
    ;; 150 is an outlier diff
    (let [result (#'find-outliers/detect-outliers
                  [{:dimension 1 :value 10} {:dimension 2 :value 20}
                   {:dimension 3 :value 30} {:dimension 4 :value 40}
                   {:dimension 5 :value 50} {:dimension 6 :value 200}
                   {:dimension 7 :value 210}])]
      (is (= [{:dimension 6 :value 200}] result))))

  (testing "no outliers → empty"
    (is (= [] (#'find-outliers/detect-outliers
               [{:dimension 1 :value 10} {:dimension 2 :value 11}
                {:dimension 3 :value 10} {:dimension 4 :value 11}
                {:dimension 5 :value 10} {:dimension 6 :value 11}]))))

  (testing "unsorted input → correctly sorts by dimension first"
    ;; Same as the non-cumulative outlier test but scrambled order
    (let [result (#'find-outliers/detect-outliers
                  [{:dimension 5 :value 100} {:dimension 3 :value 12}
                   {:dimension 7 :value 10} {:dimension 1 :value 10}
                   {:dimension 6 :value 11} {:dimension 4 :value 10}
                   {:dimension 2 :value 11}])]
      (is (= [{:dimension 5 :value 100}] result))))

  (testing "mixed integer/double values (numeric equality)"
    ;; MAD=0 case with mixed types: all 5, one 5.0 among them, one outlier
    (let [result (#'find-outliers/detect-outliers
                  [{:dimension 1 :value 5} {:dimension 2 :value 5.0}
                   {:dimension 3 :value 5} {:dimension 4 :value 5}
                   {:dimension 5 :value 5} {:dimension 6 :value 99}])]
      (is (= [{:dimension 6 :value 99}] result)))))
