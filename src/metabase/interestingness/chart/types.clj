(ns metabase.interestingness.chart.types
  "Malli schemas for chart statistics computation."
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; -------------------------------------------------- Input Schemas -------------------------------------------------

(mr/def ::axis-value
  "A value along a chart axis: the category name, x/y coordinate, or date/time label for a data point."
  [:or :string number? :boolean ms/TemporalInstant])

(mr/def ::column-type
  "Type of data in a column."
  [:enum "string" "number" "datetime" "date" "time" "boolean"])

(mr/def ::column-metadata
  "Metadata about a column in the chart data."
  [:map {:closed true}
   [:name :string]
   [:type ::column-type]])

(mr/def ::series-config
  "Configuration for a single series in a chart."
  [:map {:closed true}
   [:x ::column-metadata]
   [:y ::column-metadata]
   [:x_values [:sequential ::axis-value]]
   [:y_values [:sequential number?]]
   [:display_name :string]
   [:chart_type {:optional true} [:maybe :string]]
   [:stacked {:optional true} [:maybe :boolean]]])

(mr/def ::timeline-event
  "A timeline event that may be relevant to the chart."
  [:map {:closed true}
   [:name :string]
   [:timestamp :string]
   [:description {:optional true} [:maybe :string]]
   [:icon {:optional true} [:maybe :string]]])

(mr/def ::chart-config
  "Full chart configuration received from ai-service."
  [:map {:closed true}
   [:series [:map-of :string ::series-config]]
   [:timeline_events {:optional true} [:maybe [:sequential ::timeline-event]]]
   [:query {:optional true} [:maybe ::lib-be.schema/maybe-legacy-query]]
   [:display_type {:optional true} [:maybe :string]]
   [:title {:optional true} [:maybe :string]]])

;;; ------------------------------------------------- Output Schemas -------------------------------------------------

(mr/def ::series-summary
  "Basic statistical summary of a series."
  [:map {:closed true}
   [:min number?]
   [:max number?]
   [:mean number?]
   [:median number?]
   [:std-dev number?]
   [:range number?]])

(mr/def ::time-range
  "Time range covered by the chart data."
  [:map {:closed true}
   [:start ::axis-value]
   [:end ::axis-value]
   [:span-description :string]])

(mr/def ::trend-direction
  "Direction of a trend."
  [:enum :strongly-increasing :increasing :flat :decreasing :strongly-decreasing :no-clear-trend])

(mr/def ::trend-summary
  "Summary of trend in time series data."
  [:map {:closed true}
   [:direction ::trend-direction]
   [:overall-change-pct number?]
   [:start-value number?]
   [:end-value number?]])

(mr/def ::volatility-level
  "Level of volatility in the data."
  [:enum :low :moderate :high :extreme])

(mr/def ::volatility
  "Volatility metrics for time series data."
  [:map {:closed true}
   [:level ::volatility-level]
   [:coefficient-of-variation number?]
   [:max-period-change-pct number?]])

(mr/def ::significant-change
  "A significant change detected in the data."
  [:map {:closed true}
   [:from-date ::axis-value]
   [:to-date ::axis-value]
   [:from-value number?]
   [:to-value number?]
   [:change-abs number?]
   [:change-pct number?]])

(mr/def ::pattern-type
  "Type of pattern detected in the data."
  [:enum :consecutive-increase :consecutive-decrease :spike :dip :plateau])

(mr/def ::pattern-insight
  "A pattern detected in the data."
  [:map {:closed true}
   [:type ::pattern-type]
   [:description :string]
   [:from-date {:optional true} [:maybe ::axis-value]]
   [:to-date {:optional true} [:maybe ::axis-value]]])

(mr/def ::correlation-strength
  "Strength of correlation between series."
  [:enum :strong :moderate :weak :none])

(mr/def ::correlation-direction
  "Direction of correlation."
  [:enum :positive :negative :none])

(mr/def ::correlation
  "Correlation between two series."
  [:map {:closed true}
   [:series-a :string]
   [:series-b :string]
   [:coefficient number?]
   [:strength ::correlation-strength]
   [:direction ::correlation-direction]
   [:aligned-sample-size :int]])

(mr/def ::outlier
  "An outlier detected in the data."
  [:map {:closed true}
   [:index :int]
   [:label ::axis-value]
   [:value number?]
   [:modified-z-score number?]])

(mr/def ::cumulative-outlier
  "An outlier detected in cumulative data (via period-over-period diffs)."
  [:map {:closed true}
   [:index :int]
   [:label ::axis-value]
   [:value number?]
   [:diff number?]
   [:modified-z-score number?]])

;;; --------------------------------------------------- Options ------------------------------------------------------

(mr/def ::options
  "Options map for chart statistics computation."
  [:map {:closed true}
   [:deep? {:optional true} [:maybe :boolean]]
   [:max-correlation-series {:optional true} [:maybe :int]]])

(mr/def ::stats-limits
  "Notes about data-volume limits applied before computing chart statistics."
  [:map {:closed true}
   [:downsampled-series  {:optional true} [:map-of :string [:map {:closed true}
                                                            [:original-count :int]
                                                            [:sampled-count :int]]]]
   [:correlations-capped {:optional true} [:map {:closed true}
                                           [:total-series :int]
                                           [:max-correlated :int]]]])

;;; ---------------------------------------------- Chart Type Stats --------------------------------------------------

(mr/def ::extremum
  "An extreme point (peak or trough) in a series, paired with its x-coordinate."
  [:map {:closed true}
   [:x ::axis-value]
   [:y number?]])

(mr/def ::time-series-series-stats
  "Statistics for a single time series."
  [:map {:closed true}
   [:summary ::series-summary]
   [:time-range ::time-range]
   [:data-points :int]
   [:trend ::trend-summary]
   [:is-cumulative :boolean]
   [:outliers {:optional true} [:maybe [:sequential [:or ::outlier ::cumulative-outlier]]]]
   [:volatility {:optional true} [:maybe ::volatility]]
   [:patterns {:optional true} [:maybe [:sequential ::pattern-insight]]]
   [:significant-changes {:optional true} [:maybe [:sequential ::significant-change]]]
   [:most-recent-change {:optional true} [:maybe ::significant-change]]
   [:x-name {:optional true} [:maybe :string]]
   [:y-name {:optional true} [:maybe :string]]
   [:peak {:optional true} [:maybe ::extremum]]
   [:trough {:optional true} [:maybe ::extremum]]
   [:above-mean {:optional true} [:maybe :int]]])

(mr/def ::time-series-stats
  "Statistics for time series charts."
  [:map {:closed true}
   [:chart-type [:= :time-series]]
   [:series-count :int]
   [:series [:map-of :string ::time-series-series-stats]]
   [:correlations {:optional true} [:maybe [:sequential ::correlation]]]
   [:limits {:optional true} ::stats-limits]])

(mr/def ::category-stat
  "Statistics for a single category."
  [:map {:closed true}
   [:name :string]
   [:value number?]
   [:percentage {:optional true} number?]])

(mr/def ::categorical-series-stats
  "Statistics for a single categorical series."
  [:map {:closed true}
   [:summary [:maybe ::series-summary]]
   [:data-points :int]
   [:category-count :int]
   [:top-categories [:sequential ::category-stat]]
   [:bottom-categories {:optional true} [:maybe [:sequential ::category-stat]]]
   [:outliers {:optional true} [:maybe [:sequential ::outlier]]]
   [:x-name {:optional true} [:maybe :string]]
   [:y-name {:optional true} [:maybe :string]]])

(mr/def ::categorical-stats
  "Statistics for categorical charts (bar, pie, etc.)."
  [:map {:closed true}
   [:chart-type [:= :categorical]]
   [:series-count :int]
   [:series [:map-of :string ::categorical-series-stats]]
   [:correlations {:optional true} [:maybe [:sequential ::correlation]]]
   [:limits {:optional true} ::stats-limits]])

(mr/def ::regression-stats
  "Linear regression statistics."
  [:map {:closed true}
   [:slope number?]
   [:intercept number?]
   [:r-squared number?]])

(mr/def ::scatter-series-stats
  "Statistics for a single scatter series."
  [:map {:closed true}
   [:x-summary [:maybe ::series-summary]]
   [:y-summary [:maybe ::series-summary]]
   [:data-points :int]
   [:sampled-points {:optional true} [:maybe [:sequential [:sequential number?]]]]
   [:correlation {:optional true} [:maybe [:map {:closed true}
                                           [:coefficient number?]
                                           [:strength ::correlation-strength]
                                           [:direction ::correlation-direction]]]]
   [:regression {:optional true} [:maybe ::regression-stats]]
   [:outliers {:optional true} [:maybe [:sequential ::outlier]]]
   [:x-name {:optional true} [:maybe :string]]
   [:y-name {:optional true} [:maybe :string]]])

(mr/def ::scatter-stats
  "Statistics for scatter plots."
  [:map {:closed true}
   [:chart-type [:= :scatter]]
   [:series-count :int]
   [:series [:map-of :string ::scatter-series-stats]]
   [:limits {:optional true} ::stats-limits]])

(mr/def ::histogram-summary
  "Weighted summary statistics estimated from binned histogram data."
  [:map {:closed true}
   [:weighted-mean number?]
   [:weighted-std-dev number?]
   [:data-range number?]])

(mr/def ::estimated-distribution-stats
  "Distribution statistics estimated from binned histogram data using weighted approximations."
  [:map {:closed true}
   [:estimated-percentiles [:map-of :int number?]]
   [:estimated-quartiles [:map {:closed true}
                          [:q1 number?]
                          [:median number?]
                          [:q3 number?]
                          [:iqr number?]]]
   [:weighted-skewness {:optional true} [:maybe number?]]
   [:weighted-kurtosis {:optional true} [:maybe number?]]])

(mr/def ::histogram-structure
  "Structural properties of histogram bin distribution."
  [:map {:closed true}
   [:mode-bin [:maybe [:tuple number? number?]]]
   [:peak-count :int]
   [:concentration-top3 number?]
   [:gap-count :int]
   [:empty-bin-ratio number?]
   [:bin-count :int]])

(mr/def ::histogram-series-stats
  "Statistics for a single histogram series."
  [:map {:closed true}
   [:estimated-summary ::histogram-summary]
   [:total-count :int]
   [:data-points :int]
   [:bin-data [:sequential [:sequential number?]]]
   [:distribution ::estimated-distribution-stats]
   [:structure ::histogram-structure]
   [:x-name {:optional true} [:maybe :string]]
   [:y-name {:optional true} [:maybe :string]]])

(mr/def ::histogram-stats
  "Statistics for histogram charts."
  [:map {:closed true}
   [:chart-type [:= :histogram]]
   [:series-count :int]
   [:series [:map-of :string ::histogram-series-stats]]
   [:limits {:optional true} ::stats-limits]])

(mr/def ::unknown-stats
  "Fallback stats for chart types that don't have dedicated analysis (e.g. scalar)."
  [:map {:closed true}
   [:chart-type [:= :unknown]]
   [:series-count :int]
   [:message :string]
   [:limits {:optional true} ::stats-limits]])

(mr/def ::chart-stats
  "Union of all chart statistics types, dispatched on `:chart-type`."
  [:multi {:dispatch :chart-type}
   [:time-series ::time-series-stats]
   [:categorical ::categorical-stats]
   [:scatter     ::scatter-stats]
   [:histogram   ::histogram-stats]
   [:unknown     ::unknown-stats]])

;;; ------------------------------------------ Representation Schema ------------------------------------------------

(mr/def ::generate-repr-context
  "Context map for generating chart statistics representation."
  [:map {:closed true}
   [:stats ::chart-stats]
   [:title {:optional true} [:maybe :string]]
   [:display-type {:optional true} [:maybe :string]]
   [:timeline-events {:optional true} [:maybe [:sequential ::timeline-event]]]
   [:omit-temporal-context? {:optional true} [:maybe :boolean]]])
