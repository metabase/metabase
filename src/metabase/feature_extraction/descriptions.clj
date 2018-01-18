(ns metabase.feature-extraction.descriptions
  "Desciptions of all the features exposed as x-rays."
  (:require [medley.core :as m]))

(def ^:private descriptions
  {:histogram              {:label       "Distribution"
                            :description "Distribution of values."
                            :link        "https://en.wikipedia.org/wiki/Probability_mass_function"}
   :percentiles            {:label "Percentiles"
                            :link  "https://en.wikipedia.org/wiki/Percentile"}
   :sum                    {:label       "Sum"
                            :description "Sum of all values."}
   :sum-of-squares         {:label       "Sum of squares"
                            :description "Sum of squares of all values."}
   :%>mean                 {:label "Share of values greater than mean."}
   :cv                     {:label       "Coefficient of variation"
                            :description "Ratio between mean and standard deviation. Used as a dispersion measure."
                            :link        "https://en.wikipedia.org/wiki/Coefficient_of_variation"}
   :range-vs-sd            {:label "Ratio between standard deviation and range of values."}
   :mean-median-spread     {:label       "Relative mean-median spread"
                            :description "The lower the ratio, the more symmetric the distribution."}
   :range                  {:label       "Range"
                            :description "Range between the smallest and the largest value."}
   :cardinality            {:label       "Cardinality"
                            :description "Number of different values."}
   :min                    {:label "Minimal value"}
   :max                    {:label "Maximal value"}
   :mean                   {:label       "Mean"
                            :description "Mean (expected) value."
                            :link        "https://en.wikipedia.org/wiki/Mean"}
   :median                 {:label       "Median"
                            :description "Value seperating the data set in two equal halfs -- the \"middle\" value."
                            :link        "https://en.wikipedia.org/wiki/Median"}
   :var                    {:label       "Variance"
                            :description "Measure of how far the values are spread from the mean."
                            :link        "https://en.wikipedia.org/wiki/Variance"}
   :sd                     {:label       "Standard deviation"
                            :description "Measure of how far the values are spread from the mean."
                            :link        "https://en.wikipedia.org/wiki/Standard_deviation"}
   :count                  {:label       "Count"
                            :description "Number of rows in the dataset."
                            }
   :kurtosis               {:label       "Kurtosis"
                            :description "Descriptor of the shape of the distribution. Measures tail extremity (outliers)"
                            :link        "https://en.wikipedia.org/wiki/Kurtosis"}
   :skewness               {:label       "Skewness"
                            :description "Measure of asymmetry of the distribution."
                            :link        "https://en.wikipedia.org/wiki/Skewness"}
   :entropy                {:label       "Entropy"
                            :description "Measure of unpredictability of the state (ie. of its average information content)."
                            :link        "https://en.wikipedia.org/wiki/Entropy_(information_theory)"}
   :linear-regression      {:label       "Linear regression"
                            :description "Slope and intercept of a linear function fit to data."
                            :link        "https://en.wikipedia.org/wiki/Linear_regression"}
   :correlation            {:label       "Correlation"
                            :description "The quality of a least squares fitting --  the extent to which two variables have a linear relationship with each other."
                            :link        "http://mathworld.wolfram.com/CorrelationCoefficient.html"}
   :covariance             {:label       "Covariance"
                            :description "A measure of the joint variability."
                            :link        "https://en.wikipedia.org/wiki/Covariance"}
   :seasonal-decomposition {:label       "Seasonal decomposition"
                            :description "Decomposes time series into seasonal, trend, and residual components."
                            :link        "http://www.stat.washington.edu/courses/stat527/s13/readings/Cleveland_JASA_1979.pdf"}
   :earliest               {:label "The earliest value"}
   :latest                 {:label "The latest value"}
   :histogram-hour         {:label "Distribution of hours in a day"}
   :histogram-day          {:label "Distribution of days of week"}
   :histogram-month        {:label "Distribution of months"}
   :histogram-quarter      {:label "Distribution of quarters"}
   :MoM                    {:label       "Month over month"
                            :description "Last 30 days over previous 30 days growth"}
   :YoY                    {:label       "Year over year"
                            :description "Last 365 days over previous 365 days growth"}
   :WoW                    {:label       "Week over week"
                            :description "Last 7 days over previous 7 days growth"}
   :DoD                    {:label "Day over day"}})

(def ^:private conditional-descriptions
  {:growth-series (fn [{:keys [resolution]}]
                    (case resolution
                      :hour    {:label "Hourly growth"
                                :description "Series of hour to hour changes"}
                      :minute  {:label "Minute growth"
                                :description "Series of minute to minute changes"}
                      :month   {:label "Monthly growth"
                                :description "Series of month to month changes"}
                      :day     {:label "Daily growth"
                                :description "Series of day to day changes"}
                      :week    {:label "Weekly growth"
                                :description "Series of week to week changes"}
                      :quarter {:label "Quarterly growth"
                                :description "Series of quarter to quarter changes"}
                      nil      nil))})

(defn add-descriptions
  "Add descriptions of features to naked values where applicable."
  [features]
  (m/map-kv (fn [k v]
              (if-let [description (or (descriptions k)
                                       (when-let [f (conditional-descriptions k)]
                                         (f features)))]
                [k (assoc description :value v)]
                [k v]))
            features))
