(ns metabase.interestingness.chart.util-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.interestingness.chart.util :as stats.u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ nan->nil -------------------------------------------------------

(deftest ^:parallel nan->nil-test
  (testing "NaN becomes nil"
    (is (nil? (stats.u/nan->nil Double/NaN))))
  (testing "normal numbers pass through"
    (is (= 42.0 (stats.u/nan->nil 42.0)))
    (is (= 0.0 (stats.u/nan->nil 0.0)))
    (is (= -1.5 (stats.u/nan->nil -1.5))))
  (testing "infinity passes through (not NaN)"
    (is (= Double/POSITIVE_INFINITY (stats.u/nan->nil Double/POSITIVE_INFINITY)))))

;;; -------------------------------------------- compute-summary ---------------------------------------------------

(deftest ^:parallel compute-summary-basic-test
  (testing "computes correct summary statistics"
    (is (=? {:min 10.0
             :max 50.0
             :mean 30.0
             :median 30.0
             :range 40.0
             :std-dev (=?/approx [15.81 0.01])}
            (stats.u/compute-summary [10.0 20.0 30.0 40.0 50.0])))))

(deftest ^:parallel compute-summary-single-value-test
  (testing "single value has zero range"
    (is (=? {:min 42.0
             :max 42.0
             :mean 42.0
             :range 0.0}
            (stats.u/compute-summary [42.0])))))

;;; ------------------------------------------ compute-correlations ------------------------------------------------

(defn- make-series [x-vals y-vals]
  {:x_values     x-vals
   :y_values     y-vals
   :x            {:name "x" :type "number"}
   :y            {:name "y" :type "number"}
   :display_name "test"})

(deftest ^:parallel compute-correlations-perfect-positive-test
  (testing "perfectly correlated series yield coefficient ~1.0"
    (let [xs     (mapv double (range 20))
          result (#'stats.u/compute-correlations
                  {"a" (make-series xs xs)
                   "b" (make-series xs (mapv #(+ 10.0 (* 2.0 %)) xs))})]
      (is (= 1 (count result)))
      (is (=? [{:coefficient #(> % 0.99)
                :strength    :strong
                :direction   :positive}]
              result)))))

(deftest ^:parallel compute-correlations-perfect-negative-test
  (testing "inversely correlated series yield coefficient ~-1.0"
    (let [xs     (mapv double (range 20))
          result (#'stats.u/compute-correlations
                  {"a" (make-series xs xs)
                   "b" (make-series xs (mapv #(- 100.0 %) xs))})]
      (is (= 1 (count result)))
      (is (=? [{:coefficient #(< % -0.99)
                :strength    :strong
                :direction   :negative}]
              result)))))

(deftest ^:parallel compute-correlations-skipped-when-too-few-aligned-points-test
  (testing "pairs with fewer than 10 aligned points are skipped"
    (is (empty? (#'stats.u/compute-correlations
                 {"a" (make-series (range 5) (range 5))
                  "b" (make-series (range 5) (range 5 10))})))))

(deftest ^:parallel compute-correlations-no-overlap-test
  (testing "series with no common x-values produce no correlations"
    (is (empty? (#'stats.u/compute-correlations
                 {"a" (make-series (range 0 20) (range 0 20))
                  "b" (make-series (range 100 120) (range 100 120))})))))

(deftest ^:parallel compute-correlations-three-series-test
  (testing "three series produce up to C(3,2) = 3 correlation pairs"
    (let [xs (mapv double (range 20))]
      (is (= 3 (count (#'stats.u/compute-correlations
                       {"a" (make-series xs xs)
                        "b" (make-series xs (mapv #(* 2.0 %) xs))
                        "c" (make-series xs (mapv #(* 3.0 %) xs))})))))))

;;; --------------------------------------- maybe-compute-correlations ---------------------------------------------

(deftest ^:parallel maybe-compute-correlations-nil-when-not-deep-test
  (testing "returns nil when deep? is false"
    (let [xs (mapv double (range 20))]
      (is (nil? (stats.u/maybe-compute-correlations
                 {"a" (make-series xs xs)
                  "b" (make-series xs xs)}
                 {:deep? false}))))))

(deftest ^:parallel maybe-compute-correlations-nil-for-single-series-test
  (testing "returns nil when only one series"
    (let [xs (mapv double (range 20))]
      (is (nil? (stats.u/maybe-compute-correlations
                 {"a" (make-series xs xs)}
                 {:deep? true}))))))

(deftest ^:parallel maybe-compute-correlations-computes-when-deep-test
  (testing "computes correlations when deep? is true and multiple series"
    (let [xs (mapv double (range 20))]
      (is (= 1 (count (stats.u/maybe-compute-correlations
                       {"a" (make-series xs xs)
                        "b" (make-series xs (mapv #(* 2.0 %) xs))}
                       {:deep? true})))))))

(deftest ^:parallel maybe-compute-correlations-respects-max-cap-test
  (testing "caps number of series used for correlation"
    (let [xs         (mapv double (range 20))
          series-map (into {} (for [i (range 5)]
                                [(str "s" i) (make-series xs (mapv #(* (inc i) %) xs))]))
          uncapped   (stats.u/maybe-compute-correlations series-map {:deep? true})
          capped     (stats.u/maybe-compute-correlations series-map {:deep? true :max-correlation-series 3})]
      ;; C(5,2)=10 vs C(3,2)=3
      (is (= 10 (count uncapped)))
      (is (= 3 (count capped))))))

;;; ----------------------------------------- correlation-direction --------------------------------------------------

(deftest ^:parallel correlation-direction-test
  (testing "classifies correlation direction correctly"
    (is (= :positive (stats.u/correlation-direction 0.5)))
    (is (= :positive (stats.u/correlation-direction 0.01)))
    (is (= :negative (stats.u/correlation-direction -0.5)))
    (is (= :negative (stats.u/correlation-direction -0.01)))
    (is (= :none (stats.u/correlation-direction 0.0)))
    (is (= :none (stats.u/correlation-direction 0)))))

;;; ------------------------------------------ correlation-strength --------------------------------------------------

(deftest ^:parallel correlation-strength-test
  (testing "classifies correlation coefficients correctly"
    (is (= :strong (stats.u/correlation-strength 0.9)))
    (is (= :strong (stats.u/correlation-strength -0.7)))
    (is (= :moderate (stats.u/correlation-strength 0.5)))
    (is (= :moderate (stats.u/correlation-strength -0.4)))
    (is (= :weak (stats.u/correlation-strength 0.3)))
    (is (= :weak (stats.u/correlation-strength -0.2)))
    (is (= :none (stats.u/correlation-strength 0.1)))
    (is (= :none (stats.u/correlation-strength 0.0)))))

;;; ------------------------------------------- percentage-change ----------------------------------------------------

(deftest ^:parallel percentage-change-basic-test
  (testing "computes correct percentage change"
    (is (= 100.0 (stats.u/percentage-change 50.0 100.0)))
    (is (= -50.0 (stats.u/percentage-change 100.0 50.0)))
    (is (= 0.0 (stats.u/percentage-change 100.0 100.0)))))

(deftest ^:parallel percentage-change-zero-from-test
  (testing "returns 0.0 when from-val is zero"
    (is (= 0.0 (stats.u/percentage-change 0.0 100.0)))
    (is (= 0.0 (stats.u/percentage-change 0 0)))))

(deftest ^:parallel percentage-change-negative-from-test
  (testing "handles negative from-val correctly"
    (is (= 200.0 (stats.u/percentage-change -50.0 50.0)))
    (is (= -100.0 (stats.u/percentage-change -50.0 -100.0)))))

;;; ---------------------------------------- compute-series-with-labels ----------------------------------------------

(deftest ^:parallel compute-series-with-labels-test
  (testing "applies compute-fn and attaches column names"
    (let [series-data {"s1" {:x_values [1 2 3]
                             :y_values [10 20 30]
                             :x {:name "Date"}
                             :y {:name "Revenue"}}}
          result (stats.u/compute-series-with-labels
                  series-data
                  (fn [xs ys] {:sum (reduce + ys) :count (count xs)}))]
      (is (= 1 (count result)))
      (is (=? {"s1" {:sum 60
                     :count 3
                     :x-name "Date"
                     :y-name "Revenue"}}
              result)))))

(deftest ^:parallel compute-series-with-labels-nil-metadata-test
  (testing "handles nil column metadata gracefully"
    (let [series-data {"s1" {:x_values [1] :y_values [10]}}
          result (stats.u/compute-series-with-labels
                  series-data
                  (fn [_ _] {:ok true}))]
      (is (=? {"s1" {:x-name nil?
                     :y-name nil?}}
              result)))))

(deftest ^:parallel compute-series-with-labels-multiple-series-test
  (testing "processes multiple series"
    (let [series-data {"a" {:x_values [1]
                            :y_values [10]
                            :x {:name "X"}
                            :y {:name "Y"}}
                       "b" {:x_values [2]
                            :y_values [20]
                            :x {:name "X"}
                            :y {:name "Y"}}}
          result (stats.u/compute-series-with-labels
                  series-data
                  (fn [_ ys] {:val (first ys)}))]
      (is (=? {"a" {:val 10}
               "b" {:val 20}}
              result)))))

;;; ------------------------------------------- make-chart-result ----------------------------------------------------

(def ^:private sample-summary
  {:min     1.0
   :max     10.0
   :mean    5.0
   :median  5.0
   :std-dev 2.0
   :range   9.0})

(def ^:private sample-categorical-series
  {"s1" {:summary        sample-summary
         :data-points    5
         :category-count 3
         :top-categories [{:name "A" :value 10.0 :percentage 50.0}]
         :outliers       []}})

(def ^:private sample-histogram-series
  {"s1" {:estimated-summary {:weighted-mean    5.0
                             :weighted-std-dev 2.0
                             :data-range       9.0}
         :total-count       50
         :data-points       10
         :bin-data          [[1.0 5.0] [2.0 10.0]]
         :distribution      {:estimated-percentiles {25 2.0 50 5.0 75 8.0 90 9.0 95 9.5 99 9.9}
                             :estimated-quartiles   {:q1 2.0 :median 5.0 :q3 8.0 :iqr 6.0}}
         :structure         {:mode-bin           [2.0 10.0]
                             :peak-count         1
                             :concentration-top3 1.0
                             :gap-count          0
                             :empty-bin-ratio    0.0
                             :bin-count          2}}})

(deftest ^:parallel make-chart-result-basic-test
  (testing "builds standard chart result with valid schema"
    (is (=? {:chart-type    :categorical
             :series-count  1
             :series        sample-categorical-series
             :correlations  (symbol "nil #_\"key is not present.\"")}
            (stats.u/make-chart-result :categorical {"s1" {}} sample-categorical-series nil)))))

(deftest ^:parallel make-chart-result-with-correlations-test
  (testing "includes correlations when provided"
    (let [corrs [{:series-a "a" :series-b "b" :coefficient 0.9
                  :strength :strong :direction :positive}]
          series {"a" {:summary        sample-summary
                       :data-points    2
                       :category-count 2
                       :top-categories []
                       :outliers       []}
                  "b" {:summary        sample-summary
                       :data-points    2
                       :category-count 2
                       :top-categories []
                       :outliers       []}}
          result (stats.u/make-chart-result :categorical {"a" {} "b" {}} series corrs)]
      (is (= corrs (:correlations result))))))

(deftest ^:parallel make-chart-result-nil-correlations-test
  (testing "omits correlations when nil"
    (is (=? {:correlations (symbol "nil #_\"key is not present.\"")}
            (stats.u/make-chart-result :histogram {"s1" {}} sample-histogram-series nil)))))
