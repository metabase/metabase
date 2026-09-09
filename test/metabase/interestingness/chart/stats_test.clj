(ns metabase.interestingness.chart.stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.interestingness.chart.stats :as stats.core]
   [metabase.interestingness.chart.types :as stats.types]
   [metabase.models.interface :as mi]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

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

;;; ------------------------------------------- Trend-direction schema regression ----------------------------------

(deftest ^:parallel deep-stats-accepts-no-clear-trend-test
  (testing "compute-chart-stats (deep) validates a no-clear-trend series without throwing"
    ;; reconcile-direction emits "no-clear-trend" on a pathologically noisy series (CV ≥ 1);
    ;; the ::trend-direction output schema must allow it or deep-stats throws on real data.
    (let [config {:display_type "line"
                  :title        "Noisy"
                  :series       {"Noisy" {:x {:name "Date" :type "datetime"}
                                          :y {:name "Value" :type "number"}
                                          :display_name "Noisy"
                                          :x_values ["2020-01-01" "2020-01-02" "2020-01-03" "2020-01-04" "2020-01-05"]
                                          :y_values [10.0 1000.0 5.0 900.0 8.0]}}}
          stats  (stats.core/compute-chart-stats config {:deep? true})]
      (is (= :no-clear-trend (get-in stats [:series 0 :trend :direction]))))))

;;; ------------------------------------------- Downsampling Tests -------------------------------------------------

(defn- approx=max-data-points-per-series?
  "Is `n` approximately [[@#'stats.core/max-data-points-per-series]]?"
  [n]
  ;; random-sample is probabilistic, so allow 20% tolerance
  (< n (* 1.2 @#'stats.core/max-data-points-per-series)))

(deftest ^:parallel data-points-within-limit-are-not-downsampled-test
  (testing "Series within the limit are not modified"
    (is (=? {:limits (symbol "nil #_\"key is not present.\"")
             :series [{:name "series_0" :data-points 100}]}
            (stats.core/compute-chart-stats (make-chart-config 1 100) {:deep? false})))))

(deftest ^:parallel data-points-exceeding-limit-are-downsampled-test
  (testing "Series exceeding max-data-points-per-series are downsampled"
    (let [n      (+ @#'stats.core/max-data-points-per-series 5000)
          config (make-chart-config 1 n)
          stats  (stats.core/compute-chart-stats config {:deep? false})
          sampled (get-in stats [:series 0 :data-points])]
      (is (=? {:limits {:downsampled-series [{:name "series_0" :original-count n}]}}
              stats))
      (is (approx=max-data-points-per-series? sampled)
          (str "sampled " sampled " should be roughly <= " @#'stats.core/max-data-points-per-series)))))

(deftest ^:parallel downsampling-preserves-first-and-last-points-test
  (testing "Downsampled series preserves the first and last data points"
    (let [n       (+ @#'stats.core/max-data-points-per-series 1000)
          config  (make-chart-config 1 n)
          orig-ys (get-in config [:series "series_0" :y_values])]
      (is (=? {:series [{:name  "series_0"
                         :trend {:start-value (double (first orig-ys))
                                 :end-value   (double (last orig-ys))}}]}
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
      (is (=? {;; only the oversized series is recorded as downsampled
               :limits {:downsampled-series [{:name "large" :original-count large-n}]}
               :series [{:name "small" :data-points small-n}
                        {:name "large" :data-points approx=max-data-points-per-series?}]}
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

;;; ---------------------------------------- chart-stats-schema codec ----------------------------------------------

(def ^:private codec
  (mi/transform-json-with-schema "exploration_query_result.chart_stats" stats.core/chart-stats-schema))

(defn- round-trip [stats]
  ((:out codec) ((:in codec) stats)))

(deftest chart-stats-schema-dispatches-on-chart-type-test
  (testing "every chart type round-trips through the JSON codec with its keywords intact"
    (are [stats] (= stats (round-trip stats))
      {:chart-type   :time-series
       :series-count 1
       :series       [{:name        "s"
                       :summary     {:min 1.0 :max 9.0 :mean 5.0 :median 5.0 :std-dev 2.5 :range 8.0}
                       :time-range  {:start "2020-01-01" :end "2020-02-01" :duration-days 31}
                       :data-points 2
                       :trend       {:direction :strongly-increasing :overall-change-pct 12.5}
                       :volatility  {:level :moderate :coefficient-of-variation 0.3}
                       :patterns    [{:type :spike :description "a spike"}]}]}

      {:chart-type   :categorical
       :series-count 1
       :series       [{:name "s" :summary nil :data-points 1 :category-count 1
                       :top-categories [{:name "ACME" :value 41}]}]}

      {:chart-type   :scatter
       :series-count 1
       :series       [{:name "s" :x-summary nil :y-summary nil :data-points 1}]}

      {:chart-type   :histogram
       :series-count 1
       :series       [{:name              "s"
                       :estimated-summary {:weighted-mean 1.0 :weighted-std-dev 2.0 :data-range 3.0}
                       :total-count       5
                       :data-points       1
                       :bin-data          [[1.0 2.0]]
                       :distribution      {:estimated-percentiles {:p25 1.0 :p50 2.0 :p75 3.0
                                                                   :p90 4.0 :p95 5.0 :p99 6.0}
                                           :estimated-quartiles   {:q1 1.0 :median 2.0 :q3 3.0 :iqr 2.0}}
                       :structure         {:mode-bin [1.0 2.0] :peak-count 1 :concentration-top3 1.0
                                           :gap-count 0 :empty-bin-ratio 0.0 :bin-count 1}}]}

      {:chart-type :unknown :series-count 0 :message "not implemented"})))

(deftest chart-stats-schema-is-closed-test
  (testing "`:unknown` is the only door for a chart type without dedicated analysis, so a typo cannot
            ride through the `compute-chart-stats` return schema"
    (is (mr/validate stats.core/chart-stats-schema
                     {:chart-type :unknown :series-count 0 :message "not implemented"}))
    (is (not (mr/validate stats.core/chart-stats-schema
                          {:chart-type :histogrm :series-count 1 :series [{:garbage true}]})))))

(deftest chart-stats-schema-unrecognized-chart-type-reads-undecoded-test
  (testing "dropping the default branch tightens validation without hardening the read: a blob with a
            `:chart-type` this version has no branch for still rides through the decoder untouched,
            so one such row cannot break a `t2/select`"
    (is (= {:chart-type "sankey" :series-count 1}
           ((:out codec) (json/encode {:chart-type "sankey" :series-count 1}))))))

(deftest series-stats-declare-column-labels-test
  (testing "every chart type's series carries the `:x-name`/`:y-name`
           [[metabase.interestingness.chart.util/compute-series-with-labels]] attaches, and the
           schema names them"
    (let [series (:series (stats.core/compute-chart-stats (make-chart-config 2 30) {:deep? false}))]
      (is (seq series))
      (is (every? #(= "Date" (:x-name %)) series))
      (is (every? #(= "Value" (:y-name %)) series))))
  (testing "they are optional, though — stats built without that helper are still a valid series,
           which is why the hand-built fixtures in repr-test render fine"
    (let [real (first (:series (stats.core/compute-chart-stats (make-chart-config 1 30) {:deep? false})))]
      (is (mr/validate ::stats.types/time-series-series-stats real))
      (is (mr/validate ::stats.types/time-series-series-stats (dissoc real :x-name :y-name))))))
