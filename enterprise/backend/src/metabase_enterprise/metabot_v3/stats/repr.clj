(ns metabase-enterprise.metabot-v3.stats.repr
  "LLM-friendly text representation generator for chart statistics."
  (:require
   [clojure.string :as str])
  (:import
   (java.time LocalDate LocalDateTime ZonedDateTime)
   (java.time.format DateTimeFormatter TextStyle)
   (java.util Locale)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Temporal Context --------------------------------------------------

(defn- week-of-year [^LocalDate date]
  (.get date (.weekOfYear java.time.temporal.WeekFields/ISO)))

(defn- quarter-of-year [^LocalDate date]
  (inc (quot (dec (.getMonthValue date)) 3)))

(defn- generate-temporal-context
  "Generate temporal context string for the current date.
  Helps the LLM understand recency of data points."
  []
  (let [now (LocalDate/now)
        day-name (.getDisplayName (.getDayOfWeek now) TextStyle/FULL (Locale/getDefault))
        month-name (.getDisplayName (.getMonth now) TextStyle/FULL (Locale/getDefault))
        formatter (DateTimeFormatter/ofPattern "MMMM d, yyyy")]
    (str "Today is " day-name ", " (.format now formatter) "\n"
         "- Current week: Week " (week-of-year now) " of " (.getYear now) "\n"
         "- Current month: " month-name " (day " (.getDayOfMonth now) ")\n"
         "- Current quarter: Q" (quarter-of-year now) " " (.getYear now) "\n"
         "Take this into account when analyzing recent data points.\n"
         "If the latest data point falls within the current week, month, or quarter, it may represent an incomplete"
         " period and should be interpreted accordingly.")))

;;; ------------------------------------------------- Formatting -----------------------------------------------------

(defn- format-number
  "Format a number for display, handling various magnitudes."
  [n]
  (cond
    (nil? n) "N/A"
    (zero? n) "0"
    (< (Math/abs (double n)) 0.01) (format "%.4f" (double n))
    (< (Math/abs (double n)) 1) (format "%.3f" (double n))
    (< (Math/abs (double n)) 100) (format "%.2f" (double n))
    (< (Math/abs (double n)) 10000) (format "%.1f" (double n))
    :else (format "%,.0f" (double n))))

(defn- format-pct
  "Format a percentage value."
  [n]
  (if (nil? n)
    "N/A"
    (str (if (pos? n) "+" "") (format "%.1f" (double n)) "%")))

(defn- format-date
  "Format a date value for display."
  [d]
  (cond
    (nil? d) "N/A"
    (instance? LocalDate d) (str d)
    (instance? LocalDateTime d) (str d)
    (instance? ZonedDateTime d) (str d)
    :else (str d)))

(defn- trend-direction-text
  "Convert trend direction keyword to readable text."
  [direction]
  (case direction
    :strongly_increasing "strongly increasing"
    :increasing "increasing"
    :flat "flat"
    :decreasing "decreasing"
    :strongly_decreasing "strongly decreasing"
    (name direction)))

(defn- volatility-level-text
  "Convert volatility level keyword to readable text."
  [level]
  (case level
    :low "low"
    :moderate "moderate"
    :high "high"
    :extreme "extreme"
    (name level)))

;;; -------------------------------------------- Data Limits Note ---------------------------------------------------

(defn- render-limits-note
  "Render a note when data limits were applied during stats computation."
  [{:keys [downsampled_series correlations_capped]}]
  (let [parts (cond-> []
                (seq downsampled_series)
                (conj (let [entries (for [[name {:keys [original_count sampled_count]}] downsampled_series]
                                      (str name " (" original_count " → " sampled_count " points)"))]
                        (str "Data was downsampled for statistical analysis: "
                             (str/join ", " entries)
                             ". Results are based on a uniform sample of the full dataset.")))

                correlations_capped
                (conj (str "Cross-series correlations were limited to "
                           (:max_correlated correlations_capped) " of "
                           (:total_series correlations_capped)
                           " series to keep computation tractable.")))]
    (when (seq parts)
      (str "**Data Limits Applied**: " (str/join " " parts)))))

;;; ----------------------------------------- Data Characteristics ---------------------------------------------------

(defn- compute-data-characteristics
  "Derive data quality flags from pre-computed series stats."
  [{:keys [data_points category_count summary y_summary]}]
  (let [n     (or data_points category_count 0)
        s     (or y_summary summary)
        max-v (some-> s :max)
        cov   (let [mean-v (some-> s :mean)
                    std-v  (some-> s :std_dev)]
                (if (and mean-v std-v (not (zero? mean-v)))
                  (/ std-v (Math/abs (double mean-v)))
                  0.0))]
    {:small_counts  (boolean (and max-v (< max-v 20)))
     :high_variance (> cov 0.5)
     :sparse_data   (< n 10)}))

(defn- render-data-characteristics-note
  "Render a **Note**: line when any data quality warning applies."
  [series-stats]
  (let [{:keys [small_counts high_variance sparse_data]} (compute-data-characteristics series-stats)
        warnings (cond-> []
                   small_counts  (conj "small values (percentage changes may be exaggerated)")
                   high_variance (conj "high variance (fluctuations may be normal noise)")
                   sparse_data   (conj "limited data points"))]
    (when (seq warnings)
      (str "**Note**: " (str/join ", " warnings) "."))))

;;; ------------------------------------------ Series Representation -------------------------------------------------

(defn- render-series-summary
  "Render summary statistics for a series."
  [{:keys [summary time_range data_points]}]
  (let [{:keys [min max mean median std_dev]} summary
        {:keys [start end]} time_range]
    (str "**Data Points**: " data_points " (" (format-date start) " to " (format-date end) ")\n"
         "**Value Range**: " (format-number min) " to " (format-number max)
         " (median: " (format-number median) ")\n"
         "**Mean**: " (format-number mean) " | **Std Dev**: " (format-number std_dev))))

(defn- render-trend
  "Render trend information."
  [{:keys [direction overall_change_pct start_value end_value]}]
  (str "**Trend**: " (trend-direction-text direction)
       " (" (format-pct overall_change_pct) " overall, "
       "from " (format-number start_value) " to " (format-number end_value) ")"))

(defn- render-volatility
  "Render volatility information."
  [{:keys [level coefficient_of_variation max_period_change_pct]}]
  (str "**Volatility**: " (volatility-level-text level)
       " (CV: " (format "%.2f" (double coefficient_of_variation))
       ", max period change: " (format-pct max_period_change_pct) ")"))

(defn- render-outliers
  "Render outlier information."
  [outliers]
  (if (seq outliers)
    (str "**Outliers**: " (count outliers) " detected\n"
         (str/join "\n"
                   (for [{:keys [date value modified_z_score]} outliers]
                     (str "  - " (format-date date) ": " (format-number value)
                          " (z-score: " (format "%.2f" (double modified_z_score)) ")"))))
    "**Outliers**: None detected"))

(defn- render-patterns
  "Render detected patterns."
  [patterns]
  (when (seq patterns)
    (str "**Patterns**:\n"
         (str/join "\n"
                   (for [{:keys [description from_date to_date]} patterns]
                     (str "  - " description " (" (format-date from_date) " to " (format-date to_date) ")"))))))

(defn- render-significant-changes
  "Render significant changes."
  [changes]
  (when (seq changes)
    (str "**Significant Changes**:\n"
         (str/join "\n"
                   (for [{:keys [from_date to_date from_value to_value change_pct]} changes]
                     (str "  - " (format-date from_date) " → " (format-date to_date)
                          ": " (format-number from_value) " → " (format-number to_value)
                          " (" (format-pct change_pct) ")"))))))

(defn- render-most-recent-change
  "Render most recent change."
  [{:keys [from_date to_date from_value to_value change_pct] :as change}]
  (when change
    (str "**Most Recent Change**: " (format-date from_date) " → " (format-date to_date)
         ": " (format-number from_value) " → " (format-number to_value)
         " (" (format-pct change_pct) ")")))

(defn- render-series
  "Render complete statistics for a single series."
  [series-name series-stats]
  (let [{:keys [trend is_cumulative volatility outliers patterns
                significant_changes most_recent_change]} series-stats
        sections [(str "## Series: " series-name)
                  (render-series-summary series-stats)
                  (render-trend trend)
                  (when is_cumulative "**Note**: Data appears to be cumulative")
                  (when volatility (render-volatility volatility))
                  (render-outliers outliers)
                  (render-patterns patterns)
                  (render-significant-changes significant_changes)
                  (render-most-recent-change most_recent_change)]]
    (str/join "\n" (remove nil? sections))))

;;; ----------------------------------------- Correlation Representation ---------------------------------------------

(defn- render-correlations
  "Render cross-series correlations."
  [correlations]
  (when (seq correlations)
    (str "## Cross-Series Correlations\n"
         (str/join "\n"
                   (for [{:keys [series_a series_b coefficient strength direction]} correlations]
                     (str "- " series_a " vs " series_b ": "
                          (name strength) " " (name direction)
                          " (r=" (format "%.3f" (double coefficient)) ")"))))))

;;; ----------------------------------------- Timeline Events --------------------------------------------------------

(defn- render-timeline-events
  "Render relevant timeline events."
  [events]
  (when (seq events)
    (str "## Timeline Events\n"
         (str/join "\n"
                   (for [{:keys [name timestamp description]} events]
                     (str "- **" timestamp "**: " name
                          (when description (str " - " description))))))))

;;; ----------------------------------------- Categorical Representation ---------------------------------------------

(defn- render-category-list
  "Render a list of categories with values and percentages."
  [categories]
  (str/join "\n"
            (for [{:keys [name value percentage]} categories]
              (str "  - " name ": " (format-number value)
                   " (" (format "%.1f" (double percentage)) "%)"))))

(defn- render-categorical-series
  "Render stats for a single categorical series."
  [series-name {:keys [x_name y_name summary category_count
                       top_categories bottom_categories outliers] :as series-stats}]
  (let [sections [(str "## Series: " series-name)
                  (when x_name (str "**X-axis**: " x_name))
                  (when y_name (str "**Y-axis**: " y_name))
                  (str "**Data Points**: " category_count)
                  (str "**Categories**: " category_count)
                  (render-data-characteristics-note series-stats)
                  (when summary
                    (str "**Value Range**: " (format-number (:min summary))
                         " to " (format-number (:max summary))
                         " (median: " (format-number (:median summary)) ")"))
                  (when (seq top_categories)
                    (str "**Top Categories**:\n" (render-category-list top_categories)))
                  (when (seq bottom_categories)
                    (str "**Bottom Categories**:\n" (render-category-list bottom_categories)))
                  (render-outliers outliers)]]
    (str/join "\n" (remove nil? sections))))

(defn- generate-categorical-representation
  "Generate markdown representation for categorical (bar, pie, funnel, etc.) stats."
  [{:keys [title display-type stats timeline-events]}]
  (let [{:keys [series_count series correlations limits]} stats
        header              (str "# Chart Analysis\n"
                                 (when title (str "## Chart: " title "\n"))
                                 "**Type**: Categorical" (when display-type (str " (" display-type ")")) "\n"
                                 "**Series Count**: " series_count)
        limits-note         (when limits (render-limits-note limits))
        series-sections     (str/join "\n\n"
                                      (for [[series-name s] series]
                                        (render-categorical-series series-name s)))
        correlation-section (render-correlations correlations)
        events-section      (render-timeline-events timeline-events)]
    (str/join "\n\n"
              (remove str/blank?
                      [header limits-note series-sections correlation-section events-section]))))

;;; ------------------------------------------ Scatter Representation ------------------------------------------------

(defn- correlation-label [{:keys [strength direction]}]
  (str (name strength) " " (name direction)))

(defn- render-scatter-sample-data
  "Render sampled points as 'x: y | x: y | ...'."
  [sampled-points]
  (when (seq sampled-points)
    (str "**Sample Data** (" (count sampled-points) " points):\n"
         (str/join " | " (map (fn [[x y]]
                                (str (format-number x) ": " (format-number y)))
                              sampled-points)))))

(defn- render-scatter-outliers
  "Render outliers as 'x=..., y=...'"
  [outliers]
  (when (seq outliers)
    (let [total (count outliers)
          shown (take 5 outliers)
          lines (map (fn [{:keys [date value]}]
                       (str "- x=" (format-number date) ", y=" (format-number value)))
                     shown)
          more  (when (> total 5)
                  (str "... and " (- total 5) " more"))]
      (str "**Outliers** (" total " total, showing up to 5):\n"
           (str/join "\n" (remove nil? (concat lines [more])))))))

(defn- render-scatter-series
  "Render stats for a single scatter series."
  [series-name {:keys [x_name y_name x_summary y_summary data_points
                       correlation regression sampled_points outliers] :as series-stats}]
  (let [sections [(str "## Series: " series-name)
                  (str "**Data Points**: " data_points)
                  (when x_name (str "**X-axis**: " x_name))
                  (when y_name (str "**Y-axis**: " y_name))
                  (render-data-characteristics-note series-stats)
                  (when x_summary
                    (str "**X-axis Range**: " (format-number (:min x_summary))
                         " to " (format-number (:max x_summary))))
                  (when y_summary
                    (str "**Y-axis Range**: " (format-number (:min y_summary))
                         " to " (format-number (:max y_summary))))
                  (when correlation
                    (str "**Relationship**: " (correlation-label correlation)
                         " (r = " (format "%.2f" (double (:coefficient correlation))) ")"))
                  (when regression
                    (str "**Trend Line**: y = "
                         (format "%.3f" (double (:slope regression))) "x + "
                         (format "%.3f" (double (:intercept regression)))))
                  (render-scatter-sample-data sampled_points)
                  (render-scatter-outliers outliers)]]
    (str/join "\n" (remove nil? sections))))

(defn- generate-scatter-representation
  "Generate markdown representation for scatter plot stats."
  [{:keys [title display-type stats timeline-events]}]
  (let [{:keys [series_count series limits]} stats
        header          (str "# Chart Analysis\n"
                             (when title (str "## Chart: " title "\n"))
                             "**Type**: Scatter" (when display-type (str " (" display-type ")")) "\n"
                             "**Series Count**: " series_count)
        limits-note     (when limits (render-limits-note limits))
        series-sections (str/join "\n\n"
                                  (for [[series-name s] series]
                                    (render-scatter-series series-name s)))
        events-section  (render-timeline-events timeline-events)]
    (str/join "\n\n"
              (remove str/blank? [header limits-note series-sections events-section]))))

;;; ----------------------------------------- Histogram Representation -----------------------------------------------

(defn- skewness-description [skewness]
  (cond
    (> skewness 0.5)  "right-skewed (tail extends toward higher values)"
    (< skewness -0.5) "left-skewed (tail extends toward lower values)"
    :else             "approximately symmetric"))

(defn- kurtosis-description [kurtosis]
  (cond
    (> kurtosis 1)  "heavy tails (more extreme values than normal)"
    (< kurtosis -1) "light tails (fewer extreme values than normal)"
    :else           nil))

(defn- render-histogram-bin-data
  "Render bin data as 'x: y | x: y | ...'."
  [bin_data]
  (when (seq bin_data)
    (str "**Bin Data** (" (count bin_data) " bins):\n"
         (str/join " | " (map (fn [[x y]]
                                (str (format-number x) ": " (format-number y)))
                              bin_data)))))

(defn- render-histogram-series
  "Render stats for a single histogram series."
  [series-name {:keys [x_name y_name summary data_points bin_data distribution] :as series-stats}]
  (let [{:keys [skewness kurtosis percentiles quartiles]} distribution
        p-str     (when (seq percentiles)
                    (str "**Percentiles**: "
                         "P25=" (format-number (get percentiles 25))
                         ", P50=" (format-number (get percentiles 50))
                         ", P75=" (format-number (get percentiles 75))
                         ", P90=" (format-number (get percentiles 90))))
        iqr-str   (when quartiles
                    (str "**IQR**: " (format-number (:iqr quartiles))
                         " (Q1=" (format-number (:q1 quartiles))
                         " to Q3=" (format-number (:q3 quartiles)) ")"))
        shape-str (when skewness
                    (let [k-desc (when kurtosis (kurtosis-description kurtosis))]
                      (str "**Distribution Shape**: " (skewness-description skewness)
                           (when k-desc (str ", " k-desc)))))
        sections  [(str "## Series: " series-name)
                   (when x_name (str "**X-axis**: " x_name))
                   (when y_name (str "**Y-axis**: " y_name))
                   (str "**Data Points**: " data_points)
                   (render-data-characteristics-note series-stats)
                   (when summary
                     (str "**Value Range**: " (format-number (:min summary))
                          " to " (format-number (:max summary))
                          " (median: " (format-number (:median summary)) ")"))
                   p-str iqr-str shape-str
                   (render-histogram-bin-data bin_data)]]
    (str/join "\n" (remove nil? sections))))

(defn- generate-histogram-representation
  "Generate markdown representation for histogram stats."
  [{:keys [title display-type stats timeline-events]}]
  (let [{:keys [series_count series limits]} stats
        header          (str "# Chart Analysis\n"
                             (when title (str "## Chart: " title "\n"))
                             "**Type**: Histogram" (when display-type (str " (" display-type ")")) "\n"
                             "**Series Count**: " series_count)
        limits-note     (when limits (render-limits-note limits))
        series-sections (str/join "\n\n"
                                  (for [[series-name s] series]
                                    (render-histogram-series series-name s)))
        events-section  (render-timeline-events timeline-events)]
    (str/join "\n\n"
              (remove str/blank? [header limits-note series-sections events-section]))))

;;; ----------------------------------------- Main Representation ----------------------------------------------------

(defn- generate-time-series-representation
  "Generate comprehensive markdown representation for time series stats."
  [{:keys [title display-type stats timeline-events]}]
  (let [{:keys [series_count series correlations limits]} stats
        header (str "# Chart Analysis\n"
                    (when title (str "## Chart: " title "\n"))
                    "**Type**: Time Series" (when display-type (str " (" display-type ")")) "\n"
                    "**Series Count**: " series_count)
        limits-note (when limits (render-limits-note limits))
        temporal-context (generate-temporal-context)
        series-sections (str/join "\n\n"
                                  (for [[name s] series]
                                    (render-series name s)))
        correlation-section (render-correlations correlations)
        events-section (render-timeline-events timeline-events)]
    (str/join "\n\n"
              (remove str/blank?
                      [header
                       limits-note
                       temporal-context
                       series-sections
                       correlation-section
                       events-section]))))

(defn generate-representation
  "Generate markdown representation for chart statistics.
  Dispatches based on chart type."
  [{:keys [stats] :as context}]
  (case (:chart_type stats)
    :time-series  (generate-time-series-representation context)
    :categorical  (generate-categorical-representation context)
    :scatter      (generate-scatter-representation context)
    :histogram    (generate-histogram-representation context)
    (str "# Chart Analysis\n"
         "**Type**: " (name (:chart_type stats)) "\n"
         "Statistics computation for this chart type is not yet implemented.")))
