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

(defn generate-temporal-context
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
         "Take this into account when analyzing recent data points.")))

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

;;; ----------------------------------------- Main Representation ----------------------------------------------------

(defn generate-time-series-representation
  "Generate comprehensive markdown representation for time series stats."
  [{:keys [title stats timeline-events]}]
  (let [{:keys [series_count series correlations]} stats
        header (str "# Chart Analysis\n"
                    (when title (str "## Chart: " title "\n"))
                    "**Type**: Time Series\n"
                    "**Series Count**: " series_count)
        temporal-context (generate-temporal-context)
        series-sections (str/join "\n\n"
                                  (for [[name s] series]
                                    (render-series name s)))
        correlation-section (render-correlations correlations)
        events-section (render-timeline-events timeline-events)]
    (str/join "\n\n"
              (remove str/blank?
                      [header
                       temporal-context
                       series-sections
                       correlation-section
                       events-section]))))

(defn generate-representation
  "Generate markdown representation for chart statistics.
  Dispatches based on chart type."
  [{:keys [stats] :as context}]
  (case (:chart_type stats)
    :time-series (generate-time-series-representation context)
    ;; Fallback for unimplemented types
    (str "# Chart Analysis\n"
         "**Type**: " (name (:chart_type stats)) "\n"
         "Statistics computation for this chart type is not yet implemented.")))
