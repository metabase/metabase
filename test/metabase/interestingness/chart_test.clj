(ns metabase.interestingness.chart-test
  (:require
   [clojure.test :refer :all]
   [metabase.interestingness.chart :as chart]
   [metabase.interestingness.core :as interestingness]))

(set! *warn-on-reflection* true)

(defn- time-series-config
  "Build a time-series chart-config with the given y_values."
  [ys]
  {:display_type "line"
   :title "Test"
   :series {"s1" {:x {:name "Date" :type "datetime"}
                  :y {:name "Value" :type "number"}
                  :display_name "Value"
                  :x_values (mapv #(format "2024-01-%02d" (inc %)) (range (count ys)))
                  :y_values (mapv double ys)}}})

(defn- categorical-config
  [categories values]
  {:display_type "bar"
   :title "Test"
   :series {"s1" {:x {:name "Category" :type "string"}
                  :y {:name "Count" :type "number"}
                  :display_name "Count"
                  :x_values (vec categories)
                  :y_values (mapv double values)}}})

(deftest ^:parallel re-exported-from-core-test
  (testing "chart-interestingness is re-exported from interestingness.core"
    (is (some? (resolve 'metabase.interestingness.core/chart-interestingness)))
    (is (number? (interestingness/chart-interestingness (time-series-config (range 20)))))))

(deftest ^:parallel score-in-unit-interval-test
  (testing "chart-interestingness always returns a value in [0, 1]"
    (doseq [cfg [(time-series-config (range 30))
                 (time-series-config (repeat 30 5))
                 (categorical-config ["a" "b" "c"] [10 20 30])
                 (categorical-config ["only"] [42])]]
      (let [score (chart/chart-interestingness cfg)]
        (is (<= 0.0 score 1.0) (str "score out of range: " score))))))

(deftest ^:parallel flat-measure-is-uninteresting-test
  (testing "a chart with zero-variance y_values scores 0"
    (let [cfg (time-series-config (repeat 30 7))]
      (is (zero? (chart/chart-interestingness cfg))))))

(deftest ^:parallel single-valued-dimension-is-uninteresting-test
  (testing "a chart with a single x value scores 0"
    (let [cfg (categorical-config ["only"] [42])]
      (is (zero? (chart/chart-interestingness cfg))))))

(deftest ^:parallel trend-beats-flat-test
  (testing "a strongly-increasing time series scores higher than a nearly-flat one"
    (let [trend   (time-series-config (range 30))
          noisy   (time-series-config (map #(+ 100 (rem % 3)) (range 30)))]
      (is (> (chart/chart-interestingness trend)
             (chart/chart-interestingness noisy))))))

(deftest ^:parallel outlier-elevates-score-test
  (testing "injecting a large outlier raises the score vs. a near-constant series"
    (let [boring   (vec (repeat 29 10))
          with-out (conj (vec (repeat 29 10)) 10000)]
      (is (> (chart/chart-interestingness (time-series-config with-out))
             (chart/chart-interestingness (time-series-config boring)))))))

(deftest ^:parallel caller-supplied-stats-test
  (testing "2-arity form accepts pre-computed stats (no recomputation)"
    (let [cfg   (time-series-config (range 30))
          stats {:chart-type :time-series
                 :series-count 0
                 :series {}}
          score (chart/chart-interestingness cfg stats)]
      (is (<= 0.0 score 1.0)))))
