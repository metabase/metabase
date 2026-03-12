(ns metabase-enterprise.metabot-v3.stats.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.stats.core :as stats.core]
   [metabase-enterprise.metabot-v3.stats.repr :as repr]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers -------------------------------------------------------

(defn- make-series
  "Create a series config with n data points."
  [n]
  {:x {:name "Date" :type :datetime}
   :y {:name "Value" :type :number}
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

(deftest data-points-within-limit-are-not-downsampled-test
  (testing "Series within the limit are not modified"
    (let [config (make-chart-config 1 100)
          stats  (stats.core/compute-chart-stats config {:deep? false})]
      (is (nil? (:limits stats)))
      (is (= 100 (get-in stats [:series "series_0" :data_points]))))))

(deftest data-points-exceeding-limit-are-downsampled-test
  (testing "Series exceeding max-data-points-per-series are downsampled"
    (let [n      (+ stats.core/max-data-points-per-series 5000)
          config (make-chart-config 1 n)
          stats  (stats.core/compute-chart-stats config {:deep? false})
          sampled (get-in stats [:series "series_0" :data_points])]
      (is (some? (:limits stats)))
      (is (= n (get-in stats [:limits :downsampled_series "series_0" :original_count])))
      ;; random-sample is probabilistic, so allow 10% tolerance
      (is (< sampled (* 1.1 stats.core/max-data-points-per-series))
          (str "sampled " sampled " should be roughly <= " stats.core/max-data-points-per-series)))))

(deftest downsampling-preserves-first-and-last-points-test
  (testing "Downsampled series preserves the first and last data points"
    (let [n       (+ stats.core/max-data-points-per-series 1000)
          config  (make-chart-config 1 n)
          orig-xs (get-in config [:series "series_0" :x_values])
          orig-ys (get-in config [:series "series_0" :y_values])]
      ;; Use the private downsample fn via the stats output: check that trend
      ;; start_value and end_value match the original first/last y values
      (let [stats (stats.core/compute-chart-stats config {:deep? false})]
        (is (= (double (first orig-ys))
               (get-in stats [:series "series_0" :trend :start_value])))
        (is (= (double (last orig-ys))
               (get-in stats [:series "series_0" :trend :end_value])))))))

(deftest multiple-series-downsampled-independently-test
  (testing "Each series is downsampled independently, limits tracks each"
    (let [small-n 100
          large-n (+ stats.core/max-data-points-per-series 2000)
          config  {:display_type "line"
                   :title "Multi"
                   :series {"small" (make-series small-n)
                            "large" (make-series large-n)}}
          stats   (stats.core/compute-chart-stats config {:deep? false})]
      (is (some? (:limits stats)))
      ;; Only the large series should appear in downsampled_series
      (is (contains? (get-in stats [:limits :downsampled_series]) "large"))
      (is (not (contains? (get-in stats [:limits :downsampled_series]) "small")))
      (is (= small-n (get-in stats [:series "small" :data_points])))
      (is (< (get-in stats [:series "large" :data_points])
             (* 1.1 stats.core/max-data-points-per-series))))))

;;; ---------------------------------------- Correlation Cap Tests -------------------------------------------------

(deftest correlations-not-capped-when-within-limit-test
  (testing "Correlations are computed for all series when count <= max"
    (let [config (make-chart-config 3 50)
          stats  (stats.core/compute-chart-stats config {:deep? true})]
      (is (nil? (get-in stats [:limits :correlations_capped])))
      ;; 3 series → C(3,2) = 3 pairs possible (some may be skipped if < 10 aligned points)
      (is (some? (:correlations stats))))))

(deftest correlations-capped-when-exceeding-limit-test
  (testing "Correlations are limited to max-series-for-correlations"
    (let [n-series (+ stats.core/max-series-for-correlations 5)
          config   (make-chart-config n-series 50)
          stats    (stats.core/compute-chart-stats config {:deep? true})]
      (is (some? (get-in stats [:limits :correlations_capped])))
      (is (= n-series (get-in stats [:limits :correlations_capped :total_series])))
      (is (= stats.core/max-series-for-correlations
             (get-in stats [:limits :correlations_capped :max_correlated])))
      ;; All series should still have stats computed (only correlations are capped)
      (is (= n-series (:series_count stats)))
      (is (= n-series (count (:series stats))))
      ;; Correlations should have at most C(max-k, 2) entries
      (let [max-k stats.core/max-series-for-correlations
            max-pairs (/ (* max-k (dec max-k)) 2)]
        (is (<= (count (:correlations stats)) max-pairs))))))

;;; ------------------------------------------ Repr Limits Note Tests ----------------------------------------------

(deftest repr-includes-downsampled-note-test
  (testing "Representation includes a note about downsampled data"
    (let [n      (+ stats.core/max-data-points-per-series 1000)
          config (make-chart-config 1 n)
          stats  (stats.core/compute-chart-stats config {:deep? false})
          repr   (repr/generate-representation {:title "Test" :display-type "line" :stats stats})]
      (is (str/includes? repr "Data Limits Applied"))
      (is (str/includes? repr "downsampled")))))

(deftest repr-includes-correlations-capped-note-test
  (testing "Representation includes a note about capped correlations"
    (let [n-series (+ stats.core/max-series-for-correlations 5)
          config   (make-chart-config n-series 50)
          stats    (stats.core/compute-chart-stats config {:deep? true})
          repr     (repr/generate-representation {:title "Test" :display-type "line" :stats stats})]
      (is (str/includes? repr "Data Limits Applied"))
      (is (str/includes? repr "correlations were limited")))))

(deftest repr-no-limits-note-when-within-bounds-test
  (testing "No limits note when data is within bounds"
    (let [config (make-chart-config 2 100)
          stats  (stats.core/compute-chart-stats config {:deep? true})
          repr   (repr/generate-representation {:title "Test" :display-type "line" :stats stats})]
      (is (not (str/includes? repr "Data Limits Applied"))))))
