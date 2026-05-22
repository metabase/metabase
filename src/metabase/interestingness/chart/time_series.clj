(ns metabase.interestingness.chart.time-series
  "Time series statistics computation for chart analysis.

  Provides both basic stats (always computed) and deep stats (optional):
  - Basic: summary, time range, trend, cumulative detection, outliers
  - Deep: volatility, patterns, significant changes, correlations"
  (:require
   [metabase.interestingness.chart.outliers :as outliers]
   [metabase.interestingness.chart.types :as stats.types]
   [metabase.interestingness.chart.util :as stats.u]
   [metabase.util.malli :as mu]
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Basic Statistics ------------------------------------------------

(defn- compute-time-range
  "Compute time range information from dates.
  Returns map with :start :end :span-description"
  [dates]
  (let [sorted-dates (sort dates)
        start (first sorted-dates)
        end (last sorted-dates)
        n (count dates)]
    {:start start
     :end end
     :span-description (str n " data points from " start " to " end)}))

;;; ------------------------------------------------ Trend Detection ------------------------------------------------

(defn- slope-to-direction
  "Convert regression slope to trend direction keyword.
  Uses percentage change relative to mean for classification."
  [slope mean n]
  (if (zero? mean)
    :flat
    (let [total-change (* slope (dec n))
          pct-change (* 100.0 (/ total-change (Math/abs (double mean))))]
      (cond
        (> pct-change 50) :strongly-increasing
        (> pct-change 10) :increasing
        (< pct-change -50) :strongly-decreasing
        (< pct-change -10) :decreasing
        :else :flat))))

(defn- reconcile-direction
  "Guard against a regression-derived `direction` that would mislead the reader.

  The regression slope and the first→last `change-pct` are computed independently
  and can flatly contradict each other — the source of labels like
  'strongly increasing (-97.9% overall)'. When the slope direction disagrees in
  *sign* with the change the reader actually sees, or when the series is so noisy
  that its swings dwarf its mean (CV ≥ 1.0), report `:no-clear-trend` rather than
  asserting a direction.

  Note we deliberately do NOT suppress on moderate CV: a clean, wide ramp
  (e.g. 100→20) legitimately has CV ≈ 0.5, and is a real trend."
  [direction change-pct cv]
  (let [dir-sign (case direction
                   (:strongly-increasing :increasing) 1
                   (:strongly-decreasing :decreasing) -1
                   0)]
    (cond
      (and (not (zero? dir-sign)) (neg? (* dir-sign change-pct))) :no-clear-trend
      (>= cv 1.0)                                                 :no-clear-trend
      :else                                                       direction)))

(defn- compute-trend
  "Compute trend summary using linear regression.
  Returns map with :direction :overall-change-pct :start-value :end-value.
  `:direction` is reconciled against the first→last change and series noise (see
  [[reconcile-direction]]) so it never contradicts the data it summarizes."
  [values]
  (let [n (count values)
        values-vec (vec values)
        x-values (range n)
        regressor (dfn/linear-regressor x-values values)
        {:keys [slope]} (meta regressor)
        start-val (first values-vec)
        end-val (last values-vec)
        mean-val (dfn/mean values)
        std-dev (dfn/standard-deviation values)
        cv (if (zero? mean-val) 0.0 (/ std-dev (Math/abs (double mean-val))))
        change-pct (stats.u/percentage-change start-val end-val)]
    {:direction (reconcile-direction (slope-to-direction slope mean-val n) change-pct cv)
     :overall-change-pct change-pct
     :start-value start-val
     :end-value end-val}))

;;; --------------------------------------------- Cumulative Detection -----------------------------------------------

(defn- detect-cumulative?
  "Detect if data appears to be cumulative (monotonically increasing).
  Returns true if at least 95% of consecutive differences are non-negative."
  [values]
  (let [values-vec (vec values)
        diffs (map - (rest values-vec) values-vec)
        non-negative-count (count (filter #(>= % 0) diffs))
        total-diffs (count diffs)]
    (and (pos? total-diffs)
         (>= (/ non-negative-count total-diffs) 0.95))))

;;; ------------------------------------------------ Deep Statistics -------------------------------------------------

(defn- compute-volatility
  "Compute volatility metrics for time series.
  Returns map with :level :coefficient-of-variation :max-period-change-pct"
  [values]
  (let [mean-val (dfn/mean values)
        std-dev (dfn/standard-deviation values)
        cv (if (zero? mean-val) 0.0 (/ std-dev (Math/abs (double mean-val))))
        values-vec (vec values)
        pct-changes (for [i (range 1 (count values-vec))
                          :let [prev (nth values-vec (dec i))
                                curr (nth values-vec i)]
                          :when (not (zero? prev))]
                      (Math/abs (* 100.0 (/ (- curr prev) (Math/abs (double prev))))))
        max-change (if (seq pct-changes) (apply max pct-changes) 0.0)
        level (cond
                (< cv 0.1) :low
                (< cv 0.3) :moderate
                (< cv 0.5) :high
                :else :extreme)]
    {:level level
     :coefficient-of-variation cv
     :max-period-change-pct max-change}))

(defn- find-consecutive-streaks
  "Find consecutive increasing or decreasing streaks of length >= min-length.
  Returns sequence of maps with :type :start-idx :end-idx :length"
  [values min-length]
  (let [values-vec (vec values)
        n (count values-vec)]
    (loop [i 1
           current-type nil
           streak-start 0
           streaks []]
      (if (>= i n)
        (let [final-length (- i streak-start)]
          (if (and current-type (>= final-length min-length))
            (conj streaks {:type current-type :start-idx streak-start :end-idx (dec i) :length final-length})
            streaks))
        (let [prev (nth values-vec (dec i))
              curr (nth values-vec i)
              direction (cond
                          (> curr prev) :consecutive-increase
                          (< curr prev) :consecutive-decrease
                          :else nil)]
          (if (= direction current-type)
            (recur (inc i) current-type streak-start streaks)
            (let [streak-length (- i streak-start)
                  new-streaks (if (and current-type (>= streak-length min-length))
                                (conj streaks {:type current-type :start-idx streak-start :end-idx (dec i) :length streak-length})
                                streaks)]
              (recur (inc i) direction i new-streaks))))))))

(defn- detect-patterns
  "Detect patterns like consecutive increases/decreases (5+ periods).
  Returns sequence of pattern insight maps."
  [values dates]
  (let [dates-vec (vec dates)
        streaks (find-consecutive-streaks values 5)]
    (mapv (fn [{:keys [type start-idx end-idx length]}]
            {:type type
             :description (str (name type) " over " length " periods")
             :from-date (nth dates-vec start-idx)
             :to-date (nth dates-vec end-idx)})
          streaks)))

(defn- find-significant-changes
  "Find the top N most significant period-to-period changes.
  Returns sequence of significant change maps sorted by magnitude."
  [values dates n]
  (let [values-vec (vec values)
        dates-vec (vec dates)
        changes (for [i (range 1 (count values-vec))
                      :let [from-val (nth values-vec (dec i))
                            to-val (nth values-vec i)
                            change-abs (- to-val from-val)
                            change-pct (stats.u/percentage-change from-val to-val)]]
                  {:from-date (nth dates-vec (dec i))
                   :to-date (nth dates-vec i)
                   :from-value from-val
                   :to-value to-val
                   :change-abs change-abs
                   :change-pct change-pct})]
    (->> changes
         (sort-by #(Math/abs (double (:change-abs %))) >)
         (take n)
         vec)))

(defn- compute-most-recent-change
  "Compute the most recent period-to-period change.
  Returns a significant change map or nil if insufficient data."
  [values dates]
  (let [values-vec (vec values)
        dates-vec (vec dates)
        n (count values-vec)]
    (when (>= n 2)
      (let [from-val (nth values-vec (- n 2))
            to-val (nth values-vec (dec n))
            change-abs (- to-val from-val)
            change-pct (stats.u/percentage-change from-val to-val)]
        {:from-date (nth dates-vec (- n 2))
         :to-date (nth dates-vec (dec n))
         :from-value from-val
         :to-value to-val
         :change-abs change-abs
         :change-pct change-pct}))))

;;; ------------------------------------------------ Main Entry Point ------------------------------------------------

(defn- argmax-min
  "Find the indices of the max and min values in `values`, plus the count of
  points strictly above the mean. Single pass. Returns
  `{:argmax i :argmin j :above-mean k}` or nil when `values` is empty."
  [values]
  (when (seq values)
    (let [vs (vec values)
          n  (count vs)
          mean (/ (reduce + 0.0 vs) n)]
      (loop [i 1
             argmax 0
             argmin 0
             above (if (> (nth vs 0) mean) 1 0)]
        (if (>= i n)
          {:argmax argmax :argmin argmin :above-mean above}
          (let [v (nth vs i)]
            (recur (inc i)
                   (if (> v (nth vs argmax)) i argmax)
                   (if (< v (nth vs argmin)) i argmin)
                   (if (> v mean) (inc above) above))))))))

(defn- compute-peak-trough
  "Locate the peak (max y) and trough (min y) in a time series, together with
  their x-coordinates (dates), and count how many points sit above the mean.
  These are pre-computed answers to the questions downstream consumers (the
  AI Summary generator, for instance) need to ground citations — the
  date of the peak isn't recoverable from the summary's `:min`/`:max` alone."
  [values dates]
  (when-let [{:keys [argmax argmin above-mean]} (argmax-min values)]
    (let [vs (vec values)
          ds (vec dates)]
      {:peak           {:x (nth ds argmax) :y (nth vs argmax)}
       :trough         {:x (nth ds argmin) :y (nth vs argmin)}
       :above-mean     above-mean})))

(defn- compute-series-stats
  "Compute statistics for a single time series.

  Arguments:
    values - sequence of numeric values
    dates  - sequence of date/dimension values
    opts   - options map:
             :deep? - if true, compute additional stats (volatility, patterns, etc.)"
  [values dates {:keys [deep?] :or {deep? false}}]
  (let [is-cumulative (detect-cumulative? values)
        outliers (if is-cumulative
                   (outliers/find-outliers-cumulative values dates)
                   (outliers/find-outliers values dates))
        peak-trough (compute-peak-trough values dates)
        basic-stats (cond-> {:summary (stats.u/compute-summary values)
                             :time-range (compute-time-range dates)
                             :data-points (count values)
                             :trend (compute-trend values)
                             :is-cumulative is-cumulative
                             :outliers outliers}
                      peak-trough (merge peak-trough))]
    (if deep?
      (assoc basic-stats
             :volatility (compute-volatility values)
             :patterns (detect-patterns values dates)
             :significant-changes (find-significant-changes values dates 3)
             :most-recent-change (compute-most-recent-change values dates))
      basic-stats)))

(mu/defn compute-time-series-stats :- ::stats.types/time-series-stats
  "Compute complete time series statistics for a chart.

  Arguments:
    series-data - map of series-name -> {:x_values [...] :y_values [...]}
    opts        - options map:
                  :deep? - if true, compute additional stats"
  [series-data :- [:map-of :string ::stats.types/series-config]
   opts        :- ::stats.types/options]
  (let [series-stats (stats.u/compute-series-with-labels
                      series-data
                      (fn [x-vals y-vals]
                        (compute-series-stats y-vals x-vals opts)))
        correlations (stats.u/maybe-compute-correlations series-data opts)]
    (stats.u/make-chart-result :time-series series-data series-stats correlations)))
