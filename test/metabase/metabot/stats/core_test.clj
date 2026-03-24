(ns metabase.metabot.stats.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.stats.core :as stats.core]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers -------------------------------------------------------

(defn- make-series
  "Create a series config with n data points."
  [n]
  {:x {:name "Date" :type "datetime"}
   :y {:name "Value" :type "number"}
   :display_name "Test"
   :x_values (mapv #(str "2020-01-" (format "%02d" (inc (mod % 28)))) (range n))
   :y_values (mapv double (range n))})

(defn- make-chart-config
  "Create a chart config with the given number of series, each with n data points."
  [series-count n]
  {:display_type "line"
   :title "Test Chart"
   :series (into {} (for [i (range series-count)]
                      [(str "series_" i) (make-series n)]))})

;;; ------------------------------------------- Downsampling Tests -------------------------------------------------

(defn- approx=max-data-points-per-series?
  "Is `n` approximately [[@#'stats.core/max-data-points-per-series]]?"
  [n]
  ;; random-sample is probabilistic, so allow 20% tolerance
  (< n (* 1.2 @#'stats.core/max-data-points-per-series)))

(deftest ^:parallel data-points-within-limit-are-not-downsampled-test
  (testing "Series within the limit are not modified"
    (is (=? {:limits (symbol "nil #_\"key is not present.\"")
             :series {"series_0" {:data-points 100}}}
            (stats.core/compute-chart-stats (make-chart-config 1 100) {:deep? false})))))

(deftest ^:parallel data-points-exceeding-limit-are-downsampled-test
  (testing "Series exceeding max-data-points-per-series are downsampled"
    (let [n      (+ @#'stats.core/max-data-points-per-series 5000)
          config (make-chart-config 1 n)
          stats  (stats.core/compute-chart-stats config {:deep? false})
          sampled (get-in stats [:series "series_0" :data-points])]
      (is (=? {:limits {:downsampled-series {"series_0" {:original-count n}}}}
              stats))

      (is (approx=max-data-points-per-series? sampled)
          (str "sampled " sampled " should be roughly <= " @#'stats.core/max-data-points-per-series)))))

(deftest ^:parallel downsampling-preserves-first-and-last-points-test
  (testing "Downsampled series preserves the first and last data points"
    (let [n       (+ @#'stats.core/max-data-points-per-series 1000)
          config  (make-chart-config 1 n)
          orig-ys (get-in config [:series "series_0" :y_values])]
      (is (=? {:series {"series_0" {:trend {:start-value (double (first orig-ys))
                                            :end-value   (double (last orig-ys))}}}}
              (stats.core/compute-chart-stats config {:deep? false}))))))

(deftest ^:parallel multiple-series-downsampled-independently-test
  (testing "Each series is downsampled independently, limits tracks each"
    (let [small-n 100
          large-n (+ @#'stats.core/max-data-points-per-series 2000)
          config  {:display_type "line"
                   :title "Multi"
                   :series {"small" (make-series small-n)
                            "large" (make-series large-n)}}
          stats   (stats.core/compute-chart-stats config {:deep? false})]
      (is (=? {:limits {:downsampled-series
                        {"small" (symbol "nil #_\"key is not present.\"")
                         "large" {:original-count large-n}}}
               :series {"small" {:data-points small-n}
                        "large" {:data-points approx=max-data-points-per-series?}}}
              stats)))))

;;; ---------------------------------------- Correlation Cap Tests -------------------------------------------------

(deftest ^:parallel correlations-not-capped-when-within-limit-test
  (testing "Correlations are computed for all series when count <= max"
    (is (=? {:correlations #(= 3 (count %))
             :limits (symbol "nil #_\"key is not present.\"")}
            (stats.core/compute-chart-stats (make-chart-config 3 50) {:deep? true})))))

(deftest ^:parallel correlations-capped-when-exceeding-limit-test
  (testing "Correlations are limited to max-series-for-correlations"
    (let [n-series (+ @#'stats.core/max-series-for-correlations 5)
          config   (make-chart-config n-series 50)
          stats    (stats.core/compute-chart-stats config {:deep? true})]
      (is (=? {:limits       {:correlations-capped {:total-series   n-series
                                                    :max-correlated @#'stats.core/max-series-for-correlations}}
               :series       #(= n-series (count %))
               :series-count n-series}
              stats))
      ;; Correlations should have at most C(max-k, 2) entries
      (let [max-k @#'stats.core/max-series-for-correlations
            max-pairs (/ (* max-k (dec max-k)) 2)]
        (is (<= (count (:correlations stats)) max-pairs))))))
