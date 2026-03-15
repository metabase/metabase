(ns metabase-enterprise.metabot-v3.stats.types
  "Malli schemas for chart statistics computation."
  (:require
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Input Schemas -------------------------------------------------

(mr/def ::column-type
  "Type of data in a column."
  [:enum "string" "number" "datetime" "date" "time" "boolean"])

(mr/def ::column-metadata
  "Metadata about a column in the chart data."
  [:map
   [:name :string]
   [:type ::column-type]])

(mr/def ::series-config
  "Configuration for a single series in a chart."
  [:map
   [:x ::column-metadata]
   [:y ::column-metadata]
   [:x_values [:sequential :any]]
   [:y_values [:sequential number?]]
   [:display_name :string]
   [:chart_type {:optional true} [:maybe :string]]
   [:stacked {:optional true} [:maybe :boolean]]])

(mr/def ::timeline-event
  "A timeline event that may be relevant to the chart."
  [:map
   [:name :string]
   [:timestamp :string]
   [:description {:optional true} [:maybe :string]]
   [:icon {:optional true} [:maybe :string]]])

(mr/def ::chart-config
  "Full chart configuration received from ai-service."
  [:map
   [:series [:map-of :string ::series-config]]
   [:timeline_events {:optional true} [:maybe [:sequential ::timeline-event]]]
   [:query {:optional true} [:maybe :map]]
   [:display_type {:optional true} [:maybe :string]]
   [:title {:optional true} [:maybe :string]]])

;;; ------------------------------------------------- Output Schemas -------------------------------------------------

(mr/def ::series-summary
  "Basic statistical summary of a series."
  [:map
   [:min number?]
   [:max number?]
   [:mean number?]
   [:median number?]
   [:std_dev number?]
   [:range number?]])

(mr/def ::time-range
  "Time range covered by the chart data."
  [:map
   [:start :any]
   [:end :any]
   [:span_description :string]])

(mr/def ::trend-direction
  "Direction of a trend."
  [:enum :strongly_increasing :increasing :flat :decreasing :strongly_decreasing])

(mr/def ::trend-summary
  "Summary of trend in time series data."
  [:map
   [:direction ::trend-direction]
   [:overall_change_pct number?]
   [:start_value number?]
   [:end_value number?]])

(mr/def ::volatility-level
  "Level of volatility in the data."
  [:enum :low :moderate :high :extreme])

(mr/def ::volatility
  "Volatility metrics for time series data."
  [:map
   [:level ::volatility-level]
   [:coefficient_of_variation number?]
   [:max_period_change_pct number?]])

(mr/def ::significant-change
  "A significant change detected in the data."
  [:map
   [:from_date :any]
   [:to_date :any]
   [:from_value number?]
   [:to_value number?]
   [:change_abs number?]
   [:change_pct number?]])

(mr/def ::pattern-type
  "Type of pattern detected in the data."
  [:enum :consecutive_increase :consecutive_decrease :spike :dip :plateau])

(mr/def ::pattern-insight
  "A pattern detected in the data."
  [:map
   [:type ::pattern-type]
   [:description :string]
   [:from_date {:optional true} [:maybe :any]]
   [:to_date {:optional true} [:maybe :any]]])

(mr/def ::correlation-strength
  "Strength of correlation between series."
  [:enum :strong :moderate :weak :none])

(mr/def ::correlation-direction
  "Direction of correlation."
  [:enum :positive :negative])

(mr/def ::correlation
  "Correlation between two series."
  [:map
   [:series_a :string]
   [:series_b :string]
   [:coefficient number?]
   [:strength ::correlation-strength]
   [:direction ::correlation-direction]])

(mr/def ::outlier
  "An outlier detected in the data."
  [:map
   [:index :int]
   [:label :any]
   [:value number?]
   [:modified_z_score number?]])

(mr/def ::cumulative-outlier
  "An outlier detected in cumulative data (via period-over-period diffs)."
  [:map
   [:index :int]
   [:label :any]
   [:value number?]
   [:diff number?]
   [:modified_z_score number?]])

;;; --------------------------------------------------- Options ------------------------------------------------------

(mr/def ::options
  "Options map for chart statistics computation."
  [:map
   [:deep? {:optional true} [:maybe :boolean]]
   [:max-correlation-series {:optional true} [:maybe :int]]])

;;; ---------------------------------------------- Chart Type Stats --------------------------------------------------

(mr/def ::time-series-series-stats
  "Statistics for a single time series."
  [:map
   [:summary ::series-summary]
   [:time_range ::time-range]
   [:data_points :int]
   [:trend ::trend-summary]
   [:is_cumulative :boolean]
   [:outliers {:optional true} [:maybe [:sequential ::outlier]]]
   [:volatility {:optional true} [:maybe ::volatility]]
   [:patterns {:optional true} [:maybe [:sequential ::pattern-insight]]]
   [:significant_changes {:optional true} [:maybe [:sequential ::significant-change]]]
   [:most_recent_change {:optional true} [:maybe ::significant-change]]])

(mr/def ::time-series-stats
  "Statistics for time series charts."
  [:map
   [:chart_type [:= :time-series]]
   [:series_count :int]
   [:series [:map-of :string ::time-series-series-stats]]
   [:correlations {:optional true} [:maybe [:sequential ::correlation]]]])

(mr/def ::category-stat
  "Statistics for a single category."
  [:map
   [:name :string]
   [:value number?]
   [:percentage number?]])

(mr/def ::categorical-series-stats
  "Statistics for a single categorical series."
  [:map
   [:summary [:maybe ::series-summary]]
   [:category_count :int]
   [:top_categories [:sequential ::category-stat]]
   [:bottom_categories {:optional true} [:maybe [:sequential ::category-stat]]]
   [:outliers {:optional true} [:maybe [:sequential ::outlier]]]])

(mr/def ::categorical-stats
  "Statistics for categorical charts (bar, pie, etc.)."
  [:map
   [:chart_type [:= :categorical]]
   [:series_count :int]
   [:series [:map-of :string ::categorical-series-stats]]
   [:correlations {:optional true} [:maybe [:sequential ::correlation]]]])

(mr/def ::regression-stats
  "Linear regression statistics."
  [:map
   [:slope number?]
   [:intercept number?]
   [:r_squared number?]])

(mr/def ::scatter-series-stats
  "Statistics for a single scatter series."
  [:map
   [:x_summary [:maybe ::series-summary]]
   [:y_summary [:maybe ::series-summary]]
   [:data_points :int]
   [:correlation {:optional true} [:maybe [:map
                                           [:coefficient number?]
                                           [:strength ::correlation-strength]
                                           [:direction ::correlation-direction]]]]
   [:regression {:optional true} [:maybe ::regression-stats]]])

(mr/def ::scatter-stats
  "Statistics for scatter plots."
  [:map
   [:chart_type [:= :scatter]]
   [:series_count :int]
   [:series [:map-of :string ::scatter-series-stats]]])

(mr/def ::distribution-stats
  "Distribution statistics for histogram data."
  [:map
   [:percentiles [:map-of :int number?]]
   [:quartiles [:map
                [:q1 number?]
                [:median number?]
                [:q3 number?]
                [:iqr number?]]]
   [:skewness {:optional true} [:maybe number?]]
   [:kurtosis {:optional true} [:maybe number?]]])

(mr/def ::histogram-series-stats
  "Statistics for a single histogram series."
  [:map
   [:summary ::series-summary]
   [:data_points :int]
   [:distribution ::distribution-stats]])

(mr/def ::histogram-stats
  "Statistics for histogram charts."
  [:map
   [:chart_type [:= :histogram]]
   [:series_count :int]
   [:series [:map-of :string ::histogram-series-stats]]])

(mr/def ::chart-stats
  "Union of all chart statistics types."
  [:or
   ::time-series-stats
   ::categorical-stats
   ::scatter-stats
   ::histogram-stats])

;;; ------------------------------------------ Representation Schema ------------------------------------------------

(mr/def ::generate-repr-context
  "Context map for generating chart statistics representation.
  Accepts either a valid ::chart-stats or a map with :chart_type :unknown for the fallback branch."
  [:map
   [:stats [:or ::chart-stats [:map [:chart_type [:= :unknown]]]]]
   [:title {:optional true} [:maybe :string]]
   [:display-type {:optional true} [:maybe :string]]
   [:timeline-events {:optional true} [:maybe [:sequential ::timeline-event]]]])
