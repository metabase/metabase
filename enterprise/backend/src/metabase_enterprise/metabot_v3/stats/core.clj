(ns metabase-enterprise.metabot-v3.stats.core
  "Chart type detection and statistics routing."
  (:require
   [metabase-enterprise.metabot-v3.stats.time-series :as time-series]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Chart Type Detection ---------------------------------------------

(def ^:private explicit-display-types
  "Display types that map directly to chart types."
  {"histogram" :histogram
   "scatter"   :scatter
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
         (numeric-column-type? x-type) :scatter
         ;; 3. Heuristic from sample values
         (= :datetime (infer-type-from-sample x-values)) :time-series
         (= :number (infer-type-from-sample x-values)) :scatter
         :else :categorical)))

   ;; 4. Default
   :categorical))

;;; ---------------------------------------------------- Routing -----------------------------------------------------

(defn compute-chart-stats
  "Compute statistics for a chart based on its detected type.

  Arguments:
    chart-config - the full chart configuration
    opts         - options map:
                   :deep? - compute additional statistics"
  [chart-config opts]
  (let [chart-type (detect-chart-type chart-config)]
    (case chart-type
      :time-series (time-series/compute-time-series-stats (:series chart-config) opts)
      ;; For MVP, other types return minimal info
      {:chart_type chart-type
       :series_count (count (:series chart-config))
       :message (str "Statistics for " (name chart-type) " charts not yet implemented")})))
