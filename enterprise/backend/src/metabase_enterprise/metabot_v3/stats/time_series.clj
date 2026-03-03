(ns metabase-enterprise.metabot-v3.stats.time-series
  "Time series statistics computation for chart analysis.

  Provides both basic stats (always computed) and deep stats (optional):
  - Basic: summary, time range, trend, cumulative detection, outliers
  - Deep: volatility, patterns, significant changes, correlations"
  (:require
   [metabase-enterprise.metabot-v3.stats.outliers :as outliers]
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Basic Statistics ------------------------------------------------

(defn compute-summary
  "Compute basic statistical summary for a series of values.
  Returns map with :min :max :mean :median :std_dev :range"
  [values]
  (let [min-val (dfn/reduce-min values)
        max-val (dfn/reduce-max values)]
    {:min min-val
     :max max-val
     :mean (dfn/mean values)
     :median (dfn/median values)
     :std_dev (dfn/standard-deviation values)
     :range (- max-val min-val)}))

(defn compute-time-range
  "Compute time range information from dates.
  Returns map with :start :end :span_description"
  [dates]
  (let [sorted-dates (sort dates)
        start (first sorted-dates)
        end (last sorted-dates)
        n (count dates)]
    {:start start
     :end end
     :span_description (str n " data points from " start " to " end)}))

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
        (> pct-change 50) :strongly_increasing
        (> pct-change 10) :increasing
        (< pct-change -50) :strongly_decreasing
        (< pct-change -10) :decreasing
        :else :flat))))

(defn compute-trend
  "Compute trend summary using linear regression.
  Returns map with :direction :overall_change_pct :start_value :end_value"
  [values]
  (let [n (count values)
        values-vec (vec values)
        x-values (range n)
        regressor (dfn/linear-regressor x-values values)
        {:keys [slope]} (meta regressor)
        start-val (first values-vec)
        end-val (last values-vec)
        mean-val (dfn/mean values)
        change-pct (if (zero? start-val)
                     0.0
                     (* 100.0 (/ (- end-val start-val) (Math/abs (double start-val)))))]
    {:direction (slope-to-direction slope mean-val n)
     :overall_change_pct change-pct
     :start_value start-val
     :end_value end-val}))

;;; --------------------------------------------- Cumulative Detection -----------------------------------------------

(defn detect-cumulative?
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

(defn compute-volatility
  "Compute volatility metrics for time series.
  Returns map with :level :coefficient_of_variation :max_period_change_pct"
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
     :coefficient_of_variation cv
     :max_period_change_pct max-change}))

(defn- find-consecutive-streaks
  "Find consecutive increasing or decreasing streaks of length >= min-length.
  Returns sequence of maps with :type :start_idx :end_idx :length"
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
            (conj streaks {:type current-type :start_idx streak-start :end_idx (dec i) :length final-length})
            streaks))
        (let [prev (nth values-vec (dec i))
              curr (nth values-vec i)
              direction (cond
                          (> curr prev) :consecutive_increase
                          (< curr prev) :consecutive_decrease
                          :else nil)]
          (if (= direction current-type)
            (recur (inc i) current-type streak-start streaks)
            (let [streak-length (- i streak-start)
                  new-streaks (if (and current-type (>= streak-length min-length))
                                (conj streaks {:type current-type :start_idx streak-start :end_idx (dec i) :length streak-length})
                                streaks)]
              (recur (inc i) direction i new-streaks))))))))

(defn detect-patterns
  "Detect patterns like consecutive increases/decreases (5+ periods).
  Returns sequence of pattern insight maps."
  [values dates]
  (let [dates-vec (vec dates)
        streaks (find-consecutive-streaks values 5)]
    (mapv (fn [{:keys [type start_idx end_idx length]}]
            {:type type
             :description (str (name type) " over " length " periods")
             :from_date (nth dates-vec start_idx)
             :to_date (nth dates-vec end_idx)})
          streaks)))

(defn find-significant-changes
  "Find the top N most significant period-to-period changes.
  Returns sequence of significant change maps sorted by magnitude."
  [values dates n]
  (let [values-vec (vec values)
        dates-vec (vec dates)
        changes (for [i (range 1 (count values-vec))
                      :let [from-val (nth values-vec (dec i))
                            to-val (nth values-vec i)
                            change-abs (- to-val from-val)
                            change-pct (if (zero? from-val)
                                         0.0
                                         (* 100.0 (/ change-abs (Math/abs (double from-val)))))]]
                  {:from_date (nth dates-vec (dec i))
                   :to_date (nth dates-vec i)
                   :from_value from-val
                   :to_value to-val
                   :change_abs change-abs
                   :change_pct change-pct})]
    (->> changes
         (sort-by #(Math/abs (double (:change_abs %))) >)
         (take n)
         vec)))

(defn compute-most-recent-change
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
            change-pct (if (zero? from-val)
                         0.0
                         (* 100.0 (/ change-abs (Math/abs (double from-val)))))]
        {:from_date (nth dates-vec (- n 2))
         :to_date (nth dates-vec (dec n))
         :from_value from-val
         :to_value to-val
         :change_abs change-abs
         :change_pct change-pct}))))

;;; --------------------------------------------- Cross-Series Correlation -------------------------------------------

(defn- correlation-strength
  "Classify correlation coefficient into strength category."
  [coef]
  (let [abs-coef (Math/abs (double coef))]
    (cond
      (>= abs-coef 0.7) :strong
      (>= abs-coef 0.4) :moderate
      (>= abs-coef 0.2) :weak
      :else :none)))

(defn- align-series-on-x
  "Align two series on common x-values using listwise deletion.
  Returns [aligned-vals-a aligned-vals-b] containing only values at shared x positions."
  [x-vals-a y-vals-a x-vals-b y-vals-b]
  (let [b-lookup (zipmap x-vals-b y-vals-b)
        common-pairs (for [[x y-a] (map vector x-vals-a y-vals-a)
                           :let [y-b (get b-lookup x)]
                           :when (some? y-b)]
                       [y-a y-b])]
    [(mapv first common-pairs)
     (mapv second common-pairs)]))

(def ^:private min-correlation-sample-size
  "Minimum sample size required for meaningful correlation computation."
  10)

(defn compute-correlations
  "Compute pairwise correlations between multiple series.
  series-map is a map of series-name -> {:x_values [...] :y_values [...]}.
  Aligns series on common x-values (listwise deletion) before computing correlation.
  Skips pairs with fewer than 10 aligned data points.
  Returns sequence of correlation maps."
  [series-map]
  (let [series-names (keys series-map)
        pairs (for [a series-names
                    b series-names
                    :when (pos? (compare (str b) (str a)))]
                [a b])]
    (vec
     (for [[name-a name-b] pairs
           :let [{x-a :x_values y-a :y_values} (get series-map name-a)
                 {x-b :x_values y-b :y_values} (get series-map name-b)
                 [aligned-a aligned-b] (align-series-on-x x-a y-a x-b y-b)
                 n (count aligned-a)]
           :when (>= n min-correlation-sample-size)
           :let [coef (dfn/pearsons-correlation aligned-a aligned-b)]]
       {:series_a name-a
        :series_b name-b
        :coefficient coef
        :strength (correlation-strength coef)
        :direction (if (neg? coef) :negative :positive)
        :aligned_sample_size n}))))

;;; ------------------------------------------------ Main Entry Point ------------------------------------------------

(defn compute-series-stats
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
        basic-stats {:summary (compute-summary values)
                     :time_range (compute-time-range dates)
                     :data_points (count values)
                     :trend (compute-trend values)
                     :is_cumulative is-cumulative
                     :outliers outliers}]
    (if deep?
      (assoc basic-stats
             :volatility (compute-volatility values)
             :patterns (detect-patterns values dates)
             :significant_changes (find-significant-changes values dates 3)
             :most_recent_change (compute-most-recent-change values dates))
      basic-stats)))

(defn compute-time-series-stats
  "Compute complete time series statistics for a chart.

  Arguments:
    series-data - map of series-name -> {:x_values [...] :y_values [...]}
    opts        - options map:
                  :deep? - if true, compute additional stats"
  [series-data opts]
  (let [series-stats (into {}
                           (for [[name {:keys [x_values y_values]}] series-data]
                             [name (compute-series-stats y_values x_values opts)]))
        correlations (when (and (:deep? opts) (> (count series-data) 1))
                       (compute-correlations series-data))]
    (cond-> {:chart_type :time-series
             :series_count (count series-data)
             :series series-stats}
      correlations (assoc :correlations correlations))))
