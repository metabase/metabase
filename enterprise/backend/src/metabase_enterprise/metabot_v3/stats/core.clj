(ns metabase-enterprise.metabot-v3.stats.core
  "Chart type detection and statistics routing."
  (:require
   [metabase-enterprise.metabot-v3.stats.categorical :as categorical]
   [metabase-enterprise.metabot-v3.stats.histogram :as histogram]
   [metabase-enterprise.metabot-v3.stats.scatter :as scatter]
   [metabase-enterprise.metabot-v3.stats.time-series :as time-series]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Data Limits --------------------------------------------------

(def max-data-points-per-series
  "Maximum number of data points per series. Series exceeding this limit are downsampled to keep memory and CPU usage
  bounded."
  10000)

(def max-series-for-correlations
  "Maximum number of series to include in pairwise correlation computation."
  10)

(defn- downsample-series
  "Randomly downsample x_values and y_values to approximately `max-n` points.
  Preserves the first and last points to maintain range. Returns the series
  config with updated x_values/y_values, or unchanged if already within limit."
  [series-config max-n]
  (let [{:keys [x_values y_values]} series-config
        n (count y_values)]
    (if (<= n max-n)
      series-config
      (let [prob           (/ (double max-n) n)
            sampled        (random-sample prob (range 1 (dec n)))
            sorted-indices (into [0] cat [sampled [(dec n)]])
            x-vec          (vec x_values)
            y-vec          (vec y_values)]
        (assoc series-config
               :x_values (mapv #(nth x-vec %) sorted-indices)
               :y_values (mapv #(nth y-vec %) sorted-indices))))))

(defn- apply-data-limits
  "Apply data limits to series data, returning [limited-series-data limits-info].
  - Downsamples each series to `max-data-points-per-series` data points
  - Records which series were downsampled and from how many points"
  [series-data]
  (let [original-counts (into {} (for [[name {:keys [y_values]}] series-data]
                                   [name (count y_values)]))
        limited-series  (into {} (for [[name config] series-data]
                                   [name (downsample-series config max-data-points-per-series)]))
        downsampled     (into {} (for [[name orig-count] original-counts
                                       :let [new-count (count (get-in limited-series [name :y_values]))]
                                       :when (< new-count orig-count)]
                                   [name {:original_count orig-count :sampled_count new-count}]))]
    [limited-series
     (when (seq downsampled)
       {:downsampled_series downsampled})]))

;;; ----------------------------------------------- Chart Type Detection ---------------------------------------------

(def ^:private explicit-display-types
  "Display types that map directly to chart types."
  {"scatter"   :scatter
   "scalar"    :unknown
   "waterfall" :unknown
   "funnel"    :categorical
   "pie"       :categorical})

(defn- temporal-column-type?
  "Check if column type indicates temporal data."
  [col-type]
  (contains? #{:datetime :date :time "datetime" "date" "time"} col-type))

(defn- numeric-column-type?
  "Check if column type indicates numeric data."
  [col-type]
  (contains? #{:number "number"} col-type))

(defn- looks-like-date-string?
  "Heuristic check if a string value looks like a date."
  [s]
  (when (string? s)
    (or (re-matches #"\d{4}-\d{2}-\d{2}.*" s)
        (re-matches #"\d{2}/\d{2}/\d{4}.*" s)
        (re-matches #"\d{4}/\d{2}/\d{2}.*" s)
        (re-matches #"[A-Za-z]+ \d{1,2},? \d{4}.*" s))))

(defn- infer-type-from-sample
  "Infer column type from sample values."
  [values]
  (let [sample (take 5 (remove nil? values))]
    (cond
      (every? number? sample) :number
      (every? looks-like-date-string? sample) :datetime
      :else :string)))

(defn detect-chart-type
  "Detect the chart type from chart configuration.

  Priority:
  1. Explicit display_type mapping
  2. X-column metadata type
  3. Sample value heuristics
  4. Default to categorical"
  [{:keys [display_type series]}]
  (or
   ;; 1. Check explicit display type
   (get explicit-display-types display_type)

   ;; 2/3. Check first series x-column
   (when-let [[_ first-series] (first series)]
     (let [x-type (get-in first-series [:x :type])
           x-values (:x_values first-series)]
       (cond
         (temporal-column-type? x-type) :time-series
         (and (numeric-column-type? x-type)
              (= display_type "bar"))  :histogram
         (numeric-column-type? x-type) :scatter
         ;; 3. Heuristic from sample values
         (= :datetime (infer-type-from-sample x-values)) :time-series
         (and (= :number (infer-type-from-sample x-values))
              (= display_type "bar"))  :histogram
         (= :number (infer-type-from-sample x-values)) :scatter
         :else :categorical)))

   ;; 4. Default
   :categorical))

;;; ---------------------------------------------------- Routing -----------------------------------------------------

(defn compute-chart-stats
  "Compute statistics for a chart based on its detected type.

  Applies data limits before computation:
  - Each series is downsampled to at most [[max-data-points-per-series]] points
  - Correlation computation is limited to [[max-series-for-correlations]] series

  Arguments:
    chart-config - the full chart configuration
    opts         - options map:
                   :deep? - compute additional statistics"
  [chart-config opts]
  (let [chart-type (detect-chart-type chart-config)
        [limited-series limits-info] (apply-data-limits (:series chart-config))
        too-many-series? (> (count limited-series) max-series-for-correlations)
        opts (if too-many-series?
               (assoc opts :max-correlation-series max-series-for-correlations)
               opts)
        limits-info (if too-many-series?
                      (assoc limits-info
                             :correlations_capped {:total_series (count limited-series)
                                                   :max_correlated max-series-for-correlations})
                      limits-info)
        stats (case chart-type
                :time-series  (time-series/compute-time-series-stats limited-series opts)
                :categorical  (categorical/compute-categorical-stats limited-series opts)
                :scatter      (scatter/compute-scatter-stats limited-series opts)
                :histogram    (histogram/compute-histogram-stats limited-series opts)
                {:chart_type   chart-type
                 :series_count (count limited-series)
                 :message      (str "Statistics for " (name chart-type) " charts not yet implemented")})]
    (cond-> stats
      limits-info (assoc :limits limits-info))))
