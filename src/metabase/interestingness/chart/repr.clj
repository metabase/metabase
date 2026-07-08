(ns metabase.interestingness.chart.repr
  "LLM-friendly text representation generator for chart statistics."
  (:require
   [clojure.string :as str]
   [metabase.interestingness.chart.types :as stats.types]
   [metabase.util.malli :as mu])
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

(defn- format-label
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
    :strongly-increasing "strongly increasing"
    :increasing "increasing"
    :flat "flat"
    :decreasing "decreasing"
    :strongly-decreasing "strongly decreasing"
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

(defn- render-axis-range
  "Render '**<label> Range**: min to max' from a summary map with :min/:max."
  [label summary]
  (when summary
    (str "**" label " Range**: "
         (format-number (:min summary))
         " to "
         (format-number (:max summary)))))

(defn- render-sample-data
  "Render sampled data pairs as 'x: y | x: y | ...'."
  [data]
  (when (seq data)
    (str "**Sample Data** (" (count data) " samples):\n"
         (str/join " | " (map (fn [[x y]]
                                (str (format-number x) ": " (format-number y)))
                              data)))))

;;; -------------------------------------------- Data Limits Note ---------------------------------------------------

(defn- render-limits-note
  "Render a note when data limits were applied during stats computation."
  [{:keys [downsampled-series correlations-capped]}]
  (let [parts (cond-> []
                (seq downsampled-series)
                (conj (let [entries (for [[name {:keys [original-count sampled-count]}] downsampled-series]
                                      (str name " (" original-count " → " sampled-count " points)"))]
                        (str "Data was downsampled for statistical analysis: "
                             (str/join ", " entries)
                             ". Results are based on a uniform sample of the full dataset.")))

                correlations-capped
                (conj (str "Cross-series correlations were limited to "
                           (:max-correlated correlations-capped) " of "
                           (:total-series correlations-capped)
                           " series to keep computation tractable.")))]
    (when (seq parts)
      (str "**Data Limits Applied**: " (str/join " " parts)))))

;;; ----------------------------------------- Data Characteristics ---------------------------------------------------

(defn- compute-data-characteristics
  "Derive data quality flags from pre-computed series stats."
  [{:keys [data-points category-count summary y-summary]}]
  (let [n     (or data-points category-count 0)
        s     (or y-summary summary)
        max-v (some-> s :max)
        cov   (let [mean-v (some-> s :mean)
                    std-v  (some-> s :std-dev)]
                (if (and mean-v std-v (not (zero? mean-v)))
                  (/ std-v (Math/abs (double mean-v)))
                  0.0))]
    {:small-counts  (boolean (and max-v (< max-v 20)))
     :high-variance (> cov 0.5)
     :sparse-data   (< n 10)}))

(defn- render-data-characteristics-note
  "Render a **Note**: line when any data quality warning applies."
  [series-stats]
  (let [{:keys [small-counts high-variance sparse-data]} (compute-data-characteristics series-stats)
        warnings (cond-> []
                   small-counts  (conj "small values (percentage changes may be exaggerated)")
                   high-variance (conj "high variance (fluctuations may be normal noise)")
                   sparse-data   (conj "limited data points"))]
    (when (seq warnings)
      (str "**Note**: " (str/join ", " warnings) "."))))

;;; ------------------------------------------ Series Representation -------------------------------------------------

(defn- render-series-summary
  "Render summary statistics for a series."
  [{:keys [summary time-range data-points]}]
  (let [{:keys [min max mean median std-dev]} summary
        {:keys [start end]} time-range]
    (str "**Data Points**: " data-points " (" (format-label start) " to " (format-label end) ")\n"
         "**Value Range**: " (format-number min) " to " (format-number max)
         " (median: " (format-number median) ")\n"
         "**Mean**: " (format-number mean) " | **Std Dev**: " (format-number std-dev))))

(defn- render-trend
  "Render trend information."
  [{:keys [direction overall-change-pct start-value end-value]}]
  (str "**Trend**: " (trend-direction-text direction)
       " (" (format-pct overall-change-pct) " overall, "
       "from " (format-number start-value) " to " (format-number end-value) ")"))

(defn- render-volatility
  "Render volatility information."
  [{:keys [level coefficient-of-variation max-period-change-pct]}]
  (str "**Volatility**: " (volatility-level-text level)
       " (CV: " (format "%.2f" (double coefficient-of-variation))
       ", max period change: " (format-pct max-period-change-pct) ")"))

(defn- render-outliers
  "Render outlier information."
  [outliers]
  (if (seq outliers)
    (str "**Outliers**: " (count outliers) " detected\n"
         (str/join "\n"
                   (for [{:keys [label value modified-z-score]} outliers]
                     (str "  - " (format-label label) ": " (format-number value)
                          " (z-score: " (format "%.2f" (double modified-z-score)) ")"))))
    "**Outliers**: None detected"))

(defn- render-patterns
  "Render detected patterns."
  [patterns]
  (when (seq patterns)
    (str "**Patterns**:\n"
         (str/join "\n"
                   (for [{:keys [description from-date to-date]} patterns]
                     (str "  - " description " (" (format-label from-date) " to " (format-label to-date) ")"))))))

(defn- render-significant-changes
  "Render significant changes."
  [changes]
  (when (seq changes)
    (str "**Significant Changes**:\n"
         (str/join "\n"
                   (for [{:keys [from-date to-date from-value to-value change-pct]} changes]
                     (str "  - " (format-label from-date) " → " (format-label to-date)
                          ": " (format-number from-value) " → " (format-number to-value)
                          " (" (format-pct change-pct) ")"))))))

(defn- render-most-recent-change
  "Render most recent change."
  [{:keys [from-date to-date from-value to-value change-pct] :as change}]
  (when change
    (str "**Most Recent Change**: " (format-label from-date) " → " (format-label to-date)
         ": " (format-number from-value) " → " (format-number to-value)
         " (" (format-pct change-pct) ")")))

(defn- render-time-series
  "Render complete statistics for a single series."
  [series-name series-stats]
  (let [{:keys [trend is-cumulative volatility outliers patterns
                significant-changes most-recent-change]} series-stats
        sections [(str "## Series: " series-name)
                  (render-series-summary series-stats)
                  (render-trend trend)
                  (when is-cumulative "**Note**: Data appears to be cumulative")
                  (when volatility (render-volatility volatility))
                  (render-outliers outliers)
                  (render-patterns patterns)
                  (render-significant-changes significant-changes)
                  (render-most-recent-change most-recent-change)]]
    (str/join "\n" (remove nil? sections))))

;;; ----------------------------------------- Correlation Representation ---------------------------------------------

(defn- correlation-label [{:keys [strength direction]}]
  (if (= :none strength)
    "no correlation"
    (str (name strength) " " (name direction))))

(defn- render-correlations
  "Render cross-series correlations."
  [correlations]
  (when (seq correlations)
    (str "## Cross-Series Correlations\n"
         (str/join "\n"
                   (for [{:keys [series-a series-b coefficient] :as corr} correlations]
                     (str "- " series-a " vs " series-b ": "
                          (correlation-label corr)
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
              (cond-> (str "  - " name ": " (format-number value))
                percentage (str " (" (format "%.1f" (double percentage)) "%)")))))

(defn- render-categorical-series
  "Render stats for a single categorical series."
  [series-name {:keys [x-name y-name summary data-points category-count
                       top-categories bottom-categories outliers] :as series-stats}]
  (let [sections [(str "## Series: " series-name)
                  (when x-name (str "**X-axis**: " x-name))
                  (when y-name (str "**Y-axis**: " y-name))
                  (str "**Data Points**: " data-points)
                  (str "**Categories**: " category-count)
                  (render-data-characteristics-note series-stats)
                  (when summary
                    (str "**Value Range**: " (format-number (:min summary))
                         " to " (format-number (:max summary))
                         " (median: " (format-number (:median summary)) ")"))
                  (when (seq top-categories)
                    (str "**Top Categories**:\n" (render-category-list top-categories)))
                  (when (seq bottom-categories)
                    (str "**Bottom Categories**:\n" (render-category-list bottom-categories)))
                  (render-outliers outliers)]]
    (str/join "\n" (remove nil? sections))))

;;; ------------------------------------------ Scatter Representation ------------------------------------------------

(defn- render-scatter-outliers
  "Render outliers as 'x=..., y=...'"
  [outliers]
  (when (seq outliers)
    (let [total (count outliers)
          shown (take 5 outliers)
          lines (map (fn [{:keys [label value]}]
                       (str "- x=" (format-number label) ", y=" (format-number value)))
                     shown)
          more  (when (> total 5)
                  (str "... and " (- total 5) " more"))]
      (str "**Outliers** (" total " total, showing up to 5):\n"
           (str/join "\n" (remove nil? (concat lines [more])))))))

(defn- render-scatter-series
  "Render stats for a single scatter series."
  [series-name {:keys [x-name y-name x-summary y-summary data-points
                       correlation regression sampled-points outliers] :as series-stats}]
  (let [sections [(str "## Series: " series-name)
                  (str "**Data Points**: " data-points)
                  (when x-name (str "**X-axis**: " x-name))
                  (when y-name (str "**Y-axis**: " y-name))
                  (render-data-characteristics-note series-stats)
                  (render-axis-range "X-axis" x-summary)
                  (render-axis-range "Y-axis" y-summary)
                  (when correlation
                    (str "**Relationship**: " (correlation-label correlation)
                         " (r = " (format "%.2f" (double (:coefficient correlation))) ")"))
                  (when regression
                    (str "**Trend Line**: y = "
                         (format "%.3f" (double (:slope regression))) "x + "
                         (format "%.3f" (double (:intercept regression)))))
                  (render-sample-data sampled-points)
                  (render-scatter-outliers outliers)]]
    (str/join "\n" (remove nil? sections))))

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

(defn- render-histogram-series
  "Render stats for a single histogram series."
  [series-name {:keys [x-name y-name estimated-summary total-count data-points
                       bin-data distribution structure] :as series-stats}]
  (let [{:keys [weighted-skewness weighted-kurtosis estimated-percentiles estimated-quartiles]} distribution
        {:keys [weighted-mean weighted-std-dev data-range]} estimated-summary
        {:keys [mode-bin peak-count concentration-top3 gap-count empty-bin-ratio bin-count]} structure
        summary-str (str "**Estimated Distribution** (from " bin-count " bins, " total-count " total observations): "
                         "mean≈" (format-number weighted-mean)
                         ", std_dev≈" (format-number weighted-std-dev)
                         ", range=" (format-number data-range))
        p-str       (when (seq estimated-percentiles)
                      (str "**Estimated Percentiles**: "
                           "P25≈" (format-number (get estimated-percentiles 25))
                           ", P50≈" (format-number (get estimated-percentiles 50))
                           ", P75≈" (format-number (get estimated-percentiles 75))
                           ", P90≈" (format-number (get estimated-percentiles 90))))
        iqr-str     (when estimated-quartiles
                      (str "**Estimated IQR**: " (format-number (:iqr estimated-quartiles))
                           " (Q1≈" (format-number (:q1 estimated-quartiles))
                           " to Q3≈" (format-number (:q3 estimated-quartiles)) ")"))
        shape-str   (when weighted-skewness
                      (let [k-desc (when weighted-kurtosis (kurtosis-description weighted-kurtosis))]
                        (str "**Distribution Shape**: " (skewness-description weighted-skewness)
                             (when k-desc (str ", " k-desc)))))
        struct-str  (str "**Structure**: "
                         (when mode-bin (str "mode bin at " (format-number (first mode-bin))
                                             " (count=" (format-number (second mode-bin)) ")"))
                         (when (> peak-count 1) (str ", " peak-count " peaks (multimodal)"))
                         ", top 3 bins contain " (format "%.0f%%" (* 100.0 concentration-top3)) " of data"
                         (when (pos? gap-count) (str ", " gap-count " gap(s)"))
                         (when (pos? empty-bin-ratio) (str ", " (format "%.0f%%" (* 100.0 empty-bin-ratio)) " empty bins")))
        sections    [(str "## Series: " series-name)
                     (when x-name (str "**X-axis**: " x-name))
                     (when y-name (str "**Y-axis**: " y-name))
                     (str "**Bins**: " data-points)
                     (render-data-characteristics-note series-stats)
                     (when (seq bin-data)
                       (let [xs (mapv first bin-data)]
                         (render-axis-range "X-axis" {:min (apply min xs) :max (apply max xs)})))
                     summary-str p-str iqr-str shape-str struct-str
                     (render-sample-data bin-data)]]
    (str/join "\n" (remove nil? sections))))

;;; ----------------------------------------- Main Representation ----------------------------------------------------

(defn- generate-chart-representation
  "Shared generator for all chart types.
   `type-label`       — e.g. \"Categorical\", \"Scatter\"
   `render-series-fn` — (fn [series-name series-stats] => string)
   `extra-sections`   — seq of additional section strings to insert after limits (may contain nils)"
  [{:keys [title display-type stats timeline-events]} type-label render-series-fn extra-sections]
  (let [{:keys [series-count series correlations limits]} stats
        header          (str "# Chart Analysis\n"
                             (when title (str "## Chart: " title "\n"))
                             "**Type**: " type-label (when display-type (str " (" display-type ")")) "\n"
                             "**Series Count**: " series-count)
        limits-note     (when limits (render-limits-note limits))
        series-sections (str/join "\n\n"
                                  (for [[sname s] series]
                                    (render-series-fn sname s)))]
    (str/join "\n\n"
              (remove str/blank?
                      (concat [header limits-note]
                              extra-sections
                              [series-sections
                               (render-correlations correlations)
                               (render-timeline-events timeline-events)])))))

(mu/defn generate-representation :- :string
  "Generate markdown representation for chart statistics.
  Dispatches based on chart type."
  [{:keys [stats] :as context} :- ::stats.types/generate-repr-context]
  (case (:chart-type stats)
    :time-series  (generate-chart-representation context "Time Series" render-time-series
                                                 [(generate-temporal-context)])
    :categorical  (generate-chart-representation context "Categorical" render-categorical-series nil)
    :scatter      (generate-chart-representation context "Scatter" render-scatter-series nil)
    :histogram    (generate-chart-representation context "Histogram" render-histogram-series nil)
    (str "# Chart Analysis\n"
         "**Type**: " (name (:chart-type stats)) "\n"
         "Statistics computation for this chart type is not yet implemented.")))
