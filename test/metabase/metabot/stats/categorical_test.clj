(ns metabase.metabot.stats.categorical-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.metabot.stats.categorical :as categorical]))

(set! *warn-on-reflection* true)

(deftest ^:parallel compute-series-stats-empty-test
  (testing "empty series returns zero counts without crashing"
    (is (=? {:category-count 0
             :top-categories []
             :outliers       []
             :summary        nil?}
            (#'categorical/compute-series-stats [] [])))))

(deftest ^:parallel compute-series-stats-nil-y-filtered-test
  (testing "nil y-values are filtered out"
    (is (=? {:category-count 2
             :top-categories [{:name "C" :value 200}
                              {:name "A" :value 100}]}
            (#'categorical/compute-series-stats ["A" "B" "C"] [100 nil 200])))))

(deftest ^:parallel compute-series-stats-single-category-test
  (testing "single category has 100% share"
    (is (=? {:category-count 1
             :top-categories [{:name "only"
                               :value 42
                               :percentage 100.0}]}
            (#'categorical/compute-series-stats ["only"] [42])))))

(deftest ^:parallel compute-series-stats-percentages-sum-to-100-test
  (testing "percentages sum to approximately 100"
    (let [result (#'categorical/compute-series-stats
                  ["A" "B" "C" "D"]
                  [10 20 30 40])]
      (is (= 4 (:category-count result)))
      (let [total-pct (reduce + (map :percentage (:top-categories result)))]
        (is (== total-pct 100.0))))))

(deftest ^:parallel compute-series-stats-sorted-by-value-desc-test
  (testing "top categories are sorted by value descending"
    (is (= ["C" "B" "A"]
           (->> (#'categorical/compute-series-stats ["C" "A" "B"] [30 10 20])
                :top-categories
                (map :name))))))

(deftest ^:parallel compute-series-stats-top-10-limit-test
  (testing "top_categories capped at 10"
    (let [xs (map str (range 20))
          ys (range 1 21)]
      (is (=? {:category-count 20
               :top-categories #(= 10 (count %))}
              (#'categorical/compute-series-stats xs ys))))))

(deftest ^:parallel compute-series-stats-bottom-categories-present-test
  (testing "bottom_categories populated when > 15 categories"
    (let [xs (map str (range 16))
          ys (range 1 17)]
      (is (=? {:bottom-categories #(= 5 (count %))}
              (#'categorical/compute-series-stats xs ys))))))

(deftest ^:parallel compute-series-stats-bottom-categories-missing-test
  (testing "bottom_categories absent when <= 15 categories"
    (is (=? {:bottom-categories (symbol "nil #_\"key is not present.\"")}
            (#'categorical/compute-series-stats
             (map str (range 15))
             (range 1 16))))))

(deftest ^:parallel compute-series-stats-outliers-present-test
  (testing "outlier detection triggered at >= 5 valid points"
    (is (=? {:outliers [{:index 5
                         :label "F"
                         :value 1000
                         :modified-z-score pos?}]}
            (#'categorical/compute-series-stats
             ["A" "B" "C" "D" "E" "F"]
             [10 12 11 9 13 1000])))))

(deftest ^:parallel compute-series-stats-outliers-missing-test
  (testing "outlier detection not triggered at < 5 valid points"
    (is (=? {:outliers empty?}
            (#'categorical/compute-series-stats
             ["A" "B" "C"]
             [10 10 1000])))))

(deftest ^:parallel compute-categorical-stats-multi-series-test
  (testing "multiple series each get their own stats"
    (let [series-data {"Revenue" {:x_values ["A" "B"]
                                  :y_values [100 200]
                                  :x {:name "cat" :type "string"}
                                  :y {:name "rev" :type "number"}
                                  :display_name "Revenue"}
                       "Cost"    {:x_values ["A" "B"]
                                  :y_values [50 80]
                                  :x {:name "cat" :type "string"}
                                  :y {:name "cost" :type "number"}
                                  :display_name "Cost"}}]
      (is (=? {:chart-type :categorical
               :series-count 2
               :series {"Revenue" {:summary {:min 100
                                             :max 200
                                             :mean 150.0
                                             :median 200.0
                                             :std-dev (=?/approx [70.71 0.01])
                                             :range 100}
                                   :category-count 2
                                   :top-categories
                                   [{:name "B"
                                     :value 200
                                     :percentage (=?/approx [66.66 0.01])}
                                    {:name "A"
                                     :value 100
                                     :percentage (=?/approx [33.33 0.01])}]
                                   :outliers []
                                   :x-name "cat"
                                   :y-name "rev"}
                        "Cost" {:summary {:min 50
                                          :max 80
                                          :mean 65.0
                                          :median 80.0
                                          :std-dev (=?/approx [21.21 0.01])
                                          :range 30}
                                :category-count 2
                                :top-categories
                                [{:name "B"
                                  :value 80
                                  :percentage (=?/approx [61.5 0.1])}
                                 {:name "A"
                                  :value 50
                                  :percentage (=?/approx [38.4 0.1])}]
                                :outliers [],
                                :x-name "cat",
                                :y-name "cost"}}}
              (categorical/compute-categorical-stats series-data {:deep? false}))))))

(deftest ^:parallel compute-categorical-stats-correlations-when-deep?-test
  (testing "correlations computed with deep? and multiple series with >= 10 shared x-values"
    (let [xs  (map str (range 12))
          series-data {"A" {:x_values xs
                            :y_values (range 1 13)
                            :x {:name "cat" :type "string"}
                            :y {:name "a" :type "number"}
                            :display_name "A"}
                       "B" {:x_values xs
                            :y_values (range 2 14)
                            :x {:name "cat" :type "string"}
                            :y {:name "b" :type "number"}
                            :display_name "B"}}]
      (is (=? {:correlations #(pos? (count %))}
              (categorical/compute-categorical-stats series-data {:deep? true}))))))

(deftest ^:parallel compute-categorical-stats-correlations-when-not-deep?-test
  (testing "no correlations without deep?"
    (let [series-data {"A" {:x_values ["x" "y"]
                            :y_values [1 2]
                            :x {:name "cat" :type "string"}
                            :y {:name "a" :type "number"}
                            :display_name "A"}
                       "B" {:x_values ["x" "y"]
                            :y_values [2 3]
                            :x {:name "cat" :type "string"}
                            :y {:name "b" :type "number"}
                            :display_name "B"}}]
      (is (=? {:correlations (symbol "nil #_\"key is not present.\"")}
              (categorical/compute-categorical-stats series-data {:deep? false}))))))

(deftest ^:parallel compute-series-stats-duplicate-categories-test
  (testing "duplicate x-values are merged by summing their values"
    (let [result (#'categorical/compute-series-stats
                  ["A" "A" "B"]
                  [100 150 200])]
      (is (= 2 (:category-count result)))
      (is (= 2 (count (:top-categories result))))
      (let [by-name (into {} (map (juxt :name :value) (:top-categories result)))]
        (is (= {"A" 250 "B" 200} by-name))))))

(deftest ^:parallel compute-series-stats-nil-dimensions-excluded-test
  (testing "nil x-values are excluded from category_count"
    (is (=? {:category-count 1}
            (#'categorical/compute-series-stats
             [nil "A" nil]
             [100 200 150])))))

(deftest ^:parallel compute-series-stats-summary-values-test
  (testing "summary min, max, and mean are correct"
    (is (=? {:summary {:min  80
                       :max  200
                       :mean 132.5}}
            (#'categorical/compute-series-stats
             ["North" "South" "East" "West"]
             [100 200 150 80])))))

(deftest ^:parallel compute-series-stats-negative-values-no-percentage-test
  (testing "percentage is omitted when any value is negative"
    (let [result (#'categorical/compute-series-stats
                  ["A" "B" "C"]
                  [100 -20 50])]
      (is (= 3 (:category-count result)))
      (is (every? #(not (contains? % :percentage)) (:top-categories result))))))

(deftest ^:parallel compute-series-stats-exact-percentages-test
  (testing "percentages in top_categories match expected values"
    ;; enabled=112, disabled=103, invited=85 → total=300
    (is (=? {"enabled"  (=?/approx [37.3 0.1])
             "disabled" (=?/approx [34.4 0.1])
             "invited"  (=?/approx [28.3 0.1])}
            (->> (#'categorical/compute-series-stats
                  ["enabled" "disabled" "invited"]
                  [112 103 85])
                 :top-categories
                 (map (juxt :name :percentage))
                 (into {}))))))
