(ns metabase-enterprise.metabot-v3.stats.categorical-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase-enterprise.metabot-v3.stats.categorical :as categorical]))

(set! *warn-on-reflection* true)

(deftest compute-series-stats-empty-test
  (testing "empty series returns zero counts without crashing"
    (is (=? {:category_count 0
             :top_categories []
             :outliers       []
             :summary        nil?}
            (categorical/compute-series-stats [] [])))))

(deftest compute-series-stats-nil-y-filtered-test
  (testing "nil y-values are filtered out"
    (is (=? {:category_count 2
             :top_categories [{:name "C" :value 200}
                              {:name "A" :value 100}]}
            (categorical/compute-series-stats ["A" "B" "C"] [100 nil 200])))))

(deftest compute-series-stats-single-category-test
  (testing "single category has 100% share"
    (is (=? {:category_count 1
             :top_categories [{:name "only"
                               :value 42
                               :percentage 100.0}]}
            (categorical/compute-series-stats ["only"] [42])))))

(deftest compute-series-stats-percentages-sum-to-100-test
  (testing "percentages sum to approximately 100"
    (let [result (categorical/compute-series-stats
                  ["A" "B" "C" "D"]
                  [10 20 30 40])]
      (is (= 4 (:category_count result)))
      (let [total-pct (reduce + (map :percentage (:top_categories result)))]
        (is (== total-pct 100.0))))))

(deftest compute-series-stats-sorted-by-value-desc-test
  (testing "top categories are sorted by value descending"
    (is (= ["C" "B" "A"]
           (->> (categorical/compute-series-stats ["C" "A" "B"] [30 10 20])
                :top_categories
                (map :name))))))

(deftest compute-series-stats-top-10-limit-test
  (testing "top_categories capped at 10"
    (let [xs (map str (range 20))
          ys (range 1 21)]
      (is (=? {:category_count 20
               :top_categories #(= 10 (count %))}
              (categorical/compute-series-stats xs ys))))))

(deftest compute-series-stats-bottom-categories-present-test
  (testing "bottom_categories populated when > 15 categories"
    (let [xs (map str (range 16))
          ys (range 1 17)]
      (is (=? {:bottom_categories #(= 5 (count %))}
              (categorical/compute-series-stats xs ys))))))

(deftest compute-series-stats-bottom-categories-missing-test
  (testing "bottom_categories absent when <= 15 categories"
    (is (=? {:bottom_categories (symbol "nil #_\"key is not present.\"")}
            (categorical/compute-series-stats
             (map str (range 15))
             (range 1 16))))))

(deftest compute-series-stats-outliers-present-test
  (testing "outlier detection triggered at >= 5 valid points"
    (is (=? {:outliers [{:index 5
                         :date "F"
                         :value 1000
                         :modified_z_score pos?}]}
            (categorical/compute-series-stats
             ["A" "B" "C" "D" "E" "F"]
             [10 12 11 9 13 1000])))))

(deftest compute-series-stats-outliers-missing-test
  (testing "outlier detection not triggered at < 5 valid points"
    (is (=? {:outliers empty?}
            (categorical/compute-series-stats
             ["A" "B" "C"]
             [10 10 1000])))))

(deftest compute-categorical-stats-multi-series-test
  (testing "multiple series each get their own stats"
    (let [series-data {"Revenue" {:x_values ["A" "B"]
                                  :y_values [100 200]
                                  :x {:name "cat" :type :string}
                                  :y {:name "rev" :type :number}
                                  :display_name "Revenue"}
                       "Cost"    {:x_values ["A" "B"]
                                  :y_values [50 80]
                                  :x {:name "cat" :type :string}
                                  :y {:name "cost" :type :number}
                                  :display_name "Cost"}}]
      (is (=? {:chart_type :categorical
               :series_count 2
               :series {"Revenue" {:summary {:min 100
                                             :max 200
                                             :mean 150.0
                                             :median 200.0
                                             :std_dev (=?/approx [70.71 0.01])
                                             :range 100}
                                   :category_count 2
                                   :top_categories
                                   [{:name "B"
                                     :value 200
                                     :percentage (=?/approx [66.66 0.01])}
                                    {:name "A"
                                     :value 100
                                     :percentage (=?/approx [33.33 0.01])}]
                                   :outliers []
                                   :x_name "cat"
                                   :y_name "rev"}
                        "Cost" {:summary {:min 50
                                          :max 80
                                          :mean 65.0
                                          :median 80.0
                                          :std_dev (=?/approx [21.21 0.01])
                                          :range 30}
                                :category_count 2
                                :top_categories
                                [{:name "B"
                                  :value 80
                                  :percentage (=?/approx [61.5 0.1])}
                                 {:name "A"
                                  :value 50
                                  :percentage (=?/approx [38.4 0.1])}]
                                :outliers [],
                                :x_name "cat",
                                :y_name "cost"}}}
              (categorical/compute-categorical-stats series-data {:deep? false}))))))

(deftest compute-categorical-stats-correlations-when-deep?-test
  (testing "correlations computed with deep? and multiple series with >= 10 shared x-values"
    (let [xs  (map str (range 12))
          series-data {"A" {:x_values xs
                            :y_values (range 1 13)
                            :x {:name "cat" :type :string}
                            :y {:name "a" :type :number}
                            :display_name "A"}
                       "B" {:x_values xs
                            :y_values (range 2 14)
                            :x {:name "cat" :type :string}
                            :y {:name "b" :type :number}
                            :display_name "B"}}]
      (is (=? {:correlations #(pos? (count %))}
              (categorical/compute-categorical-stats series-data {:deep? true}))))))

(deftest compute-categorical-stats-correlations-when-not-deep?-test
  (testing "no correlations without deep?"
    (let [series-data {"A" {:x_values ["x" "y"]
                            :y_values [1 2]
                            :x {:name "cat" :type :string}
                            :y {:name "a" :type :number}
                            :display_name "A"}
                       "B" {:x_values ["x" "y"]
                            :y_values [2 3]
                            :x {:name "cat" :type :string}
                            :y {:name "b" :type :number}
                            :display_name "B"}}]
      (is (=? {:correlations (symbol "nil #_\"key is not present.\"")}
              (categorical/compute-categorical-stats series-data {:deep? false}))))))

(deftest compute-series-stats-duplicate-categories-test
  (testing "duplicate x-values: category_count counts unique dimensions only"
    (let [result (categorical/compute-series-stats
                  ["A" "A" "B"]
                  [100 150 200])]
      ;; data_point_count includes all valid pairs including duplicates
      (is (= 3 (count (:top_categories result))))
      ;; category_count is unique dimensions
      (is (=? {:category_count 2} result)))))

(deftest compute-series-stats-nil-dimensions-excluded-test
  (testing "nil x-values are excluded from category_count"
    (is (=? {:category_count 1}
            (categorical/compute-series-stats
             [nil "A" nil]
             [100 200 150])))))

(deftest compute-series-stats-summary-values-test
  (testing "summary min, max, and mean are correct"
    (is (=? {:summary {:min  80
                       :max  200
                       :mean 132.5}}
            (categorical/compute-series-stats
             ["North" "South" "East" "West"]
             [100 200 150 80])))))

(deftest compute-series-stats-exact-percentages-test
  (testing "percentages in top_categories match expected values"
    ;; enabled=112, disabled=103, invited=85 → total=300
    (is (=? {"enabled"  (=?/approx [37.3 0.1])
             "disabled" (=?/approx [34.4 0.1])
             "invited"  (=?/approx [28.3 0.1])}
            (->> (categorical/compute-series-stats
                  ["enabled" "disabled" "invited"]
                  [112 103 85])
                 :top_categories
                 (map (juxt :name :percentage))
                 (into {}))))))
