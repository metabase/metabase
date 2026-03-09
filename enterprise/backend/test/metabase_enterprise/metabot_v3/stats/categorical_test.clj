(ns metabase-enterprise.metabot-v3.stats.categorical-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.stats.categorical :as categorical]
   [metabase-enterprise.metabot-v3.stats.repr :as repr]))

(set! *warn-on-reflection* true)

(deftest compute-series-stats-empty-test
  (testing "empty series returns zero counts without crashing"
    (let [result (categorical/compute-series-stats [] [])]
      (is (= 0 (:category_count result)))
      (is (= [] (:top_categories result)))
      (is (= [] (:outliers result)))
      (is (nil? (:summary result))))))

(deftest compute-series-stats-nil-y-filtered-test
  (testing "nil y-values are filtered out"
    (let [result (categorical/compute-series-stats ["A" "B" "C"] [100 nil 200])]
      (is (= 2 (:category_count result)))
      (is (= 2 (count (:top_categories result)))))))

(deftest compute-series-stats-single-category-test
  (testing "single category has 100% share"
    (let [result (categorical/compute-series-stats ["only"] [42])]
      (is (= 1 (:category_count result)))
      (is (= 1 (count (:top_categories result))))
      (let [cat (first (:top_categories result))]
        (is (= "only" (:name cat)))
        (is (= 42 (:value cat)))
        (is (= 100.0 (:percentage cat)))))))

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
    (let [result (categorical/compute-series-stats
                  ["C" "A" "B"]
                  [30 10 20])]
      (is (= ["C" "B" "A"] (map :name (:top_categories result)))))))

(deftest compute-series-stats-top-10-limit-test
  (testing "top_categories capped at 10"
    (let [xs (map str (range 20))
          ys (range 1 21)
          result (categorical/compute-series-stats xs ys)]
      (is (= 20 (:category_count result)))
      (is (= 10 (count (:top_categories result)))))))

(deftest compute-series-stats-bottom-categories-test
  (testing "bottom_categories populated when > 15 categories"
    (let [xs (map str (range 16))
          ys (range 1 17)
          result (categorical/compute-series-stats xs ys)]
      (is (some? (:bottom_categories result)))
      (is (= 5 (count (:bottom_categories result))))))

  (testing "bottom_categories absent when <= 15 categories"
    (let [result (categorical/compute-series-stats
                  (map str (range 15))
                  (range 1 16))]
      (is (nil? (:bottom_categories result))))))

(deftest compute-series-stats-outliers-test
  (testing "outlier detection triggered at >= 5 valid points"
    (let [;; varied baseline + 1 extreme outlier (non-identical values avoid MAD=0)
          result (categorical/compute-series-stats
                  ["A" "B" "C" "D" "E" "F"]
                  [10 12 11 9 13 1000])]
      (is (some? (:outliers result)))
      (is (pos? (count (:outliers result))))))

  (testing "outlier detection not triggered at < 5 valid points"
    (let [result (categorical/compute-series-stats
                  ["A" "B" "C"]
                  [10 10 1000])]
      ;; outliers may be nil or empty when n < 5
      (is (or (nil? (:outliers result))
              (empty? (:outliers result)))))))

(deftest compute-categorical-stats-multi-series-test
  (testing "multiple series each get their own stats"
    (let [series-data {"Revenue" {:x_values ["A" "B"] :y_values [100 200]
                                  :x {:name "cat" :type :string}
                                  :y {:name "rev" :type :number}
                                  :display_name "Revenue"}
                       "Cost"    {:x_values ["A" "B"] :y_values [50 80]
                                  :x {:name "cat" :type :string}
                                  :y {:name "cost" :type :number}
                                  :display_name "Cost"}}
          result (categorical/compute-categorical-stats series-data {:deep? false})]
      (is (= :categorical (:chart_type result)))
      (is (= 2 (:series_count result)))
      (is (contains? (:series result) "Revenue"))
      (is (contains? (:series result) "Cost")))))

(deftest compute-categorical-stats-correlations-test
  (testing "correlations computed with deep? and multiple series with >= 10 shared x-values"
    (let [xs  (map str (range 12))
          series-data {"A" {:x_values xs :y_values (range 1 13)
                            :x {:name "cat" :type :string}
                            :y {:name "a" :type :number}
                            :display_name "A"}
                       "B" {:x_values xs :y_values (range 2 14)
                            :x {:name "cat" :type :string}
                            :y {:name "b" :type :number}
                            :display_name "B"}}
          result (categorical/compute-categorical-stats series-data {:deep? true})]
      (is (some? (:correlations result)))
      (is (pos? (count (:correlations result))))))

  (testing "no correlations without deep?"
    (let [series-data {"A" {:x_values ["x" "y"] :y_values [1 2]
                            :x {:name "cat" :type :string}
                            :y {:name "a" :type :number}
                            :display_name "A"}
                       "B" {:x_values ["x" "y"] :y_values [2 3]
                            :x {:name "cat" :type :string}
                            :y {:name "b" :type :number}
                            :display_name "B"}}
          result (categorical/compute-categorical-stats series-data {:deep? false})]
      (is (nil? (:correlations result))))))

(deftest compute-series-stats-duplicate-categories-test
  (testing "duplicate x-values: category_count counts unique dimensions only"
    (let [result (categorical/compute-series-stats
                  ["A" "A" "B"]
                  [100 150 200])]
      ;; data_point_count includes all valid pairs including duplicates
      (is (= 3 (count (:top_categories result))))
      ;; category_count is unique dimensions
      (is (= 2 (:category_count result))))))

(deftest compute-series-stats-nil-dimensions-excluded-test
  (testing "nil x-values are excluded from category_count"
    (let [result (categorical/compute-series-stats
                  [nil "A" nil]
                  [100 200 150])]
      ;; Only "A" is a non-nil dimension
      (is (= 1 (:category_count result))))))

(deftest compute-series-stats-summary-values-test
  (testing "summary min, max, and mean are correct"
    (let [result (categorical/compute-series-stats
                  ["North" "South" "East" "West"]
                  [100 200 150 80])
          s      (:summary result)]
      (is (some? s))
      (is (== 80 (:min s)))
      (is (== 200 (:max s)))
      (is (== 132.5 (:mean s))))))

(deftest compute-series-stats-exact-percentages-test
  (testing "percentages in top_categories match expected values"
    ;; enabled=112, disabled=103, invited=85 → total=300
    (let [result (categorical/compute-series-stats
                  ["enabled" "disabled" "invited"]
                  [112 103 85])
          cats   (into {} (map (juxt :name :percentage) (:top_categories result)))]
      (is (< (Math/abs (- (get cats "enabled") 37.3)) 0.1))
      (is (< (Math/abs (- (get cats "disabled") 34.3)) 0.1))
      (is (< (Math/abs (- (get cats "invited") 28.3)) 0.1)))))

;;; Representation tests

(deftest repr-categorical-includes-key-info-test
  (testing "representation includes series name, data count, and Categories"
    (let [series-stats (categorical/compute-series-stats ["A" "B" "C"] [100 200 150])
          stats        {:chart_type   :categorical
                        :series_count 1
                        :series       {"Test Series" series-stats}}
          rep          (repr/generate-categorical-representation {:stats stats})]
      (is (str/includes? rep "Test Series"))
      (is (str/includes? rep "Categories"))
      (is (str/includes? rep "Top Categories")))))

(deftest repr-categorical-shows-bottom-categories-for-large-dataset-test
  (testing "Bottom Categories shown when > 15 categories"
    (let [xs    (map #(str "Cat" (format "%02d" %)) (range 1 21))
          ys    (map double (range 1 21))
          series-stats (categorical/compute-series-stats xs ys)
          stats        {:chart_type   :categorical
                        :series_count 1
                        :series       {"Many" series-stats}}
          rep          (repr/generate-categorical-representation {:stats stats})]
      (is (str/includes? rep "Top Categories"))
      (is (str/includes? rep "Bottom Categories"))
      ;; highest value category (Cat20) appears
      (is (str/includes? rep "Cat20"))
      ;; lowest value category (Cat01) appears in bottom section
      (is (str/includes? rep "Cat01")))))

(deftest repr-categorical-no-bottom-categories-for-small-dataset-test
  (testing "Bottom Categories absent when <= 15 categories"
    (let [xs    (map #(str "Cat" %) (range 1 16))
          ys    (map double (range 1 16))
          series-stats (categorical/compute-series-stats xs ys)
          stats        {:chart_type   :categorical
                        :series_count 1
                        :series       {"Few" series-stats}}
          rep          (repr/generate-categorical-representation {:stats stats})]
      (is (str/includes? rep "Top Categories"))
      (is (not (str/includes? rep "Bottom Categories"))))))
