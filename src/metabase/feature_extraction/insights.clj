(ns metabase.feature-extraction.insights
  ""
  (:require [bigml.histogram.core :as h.impl]
            [metabase.feature-extraction
             [math :as math]
             [timeseries :as ts]]))

(defn normal-range
  [{:keys [histogram]}]
  {:normal-range (let [{lower 0.25 upper 0.75}
                       (h.impl/percentiles histogram 0.25 0.75)]
                   {:lower lower
                    :upper upper})})

(defn gaps
  [{:keys [nil% field]}]
  (when (pos? nil%)
    {:gaps {:mode :nils
            :quality (if (< nil% 0.1)
                       :some
                       :many)
            :filter [[:= [:field-id (:id field)] nil]]}}))

(defn autocorrelation
  [{:keys [series]}]
  (let [{:keys [autocorrelation lag]} (math/autocorrelation (map second series))]
    (when (> autocorrelation 0.3)
      {:autocorrelation {:quality (if (< autocorrelation 0.6)
                                    :weak
                                    :strong)
                         :lag     lag}})))

(defn noisiness
  [{:keys [series resolution]}]
  (let [saddles% (/ (math/saddles series) (count series))]
    (when (> saddles% 0.1)
      {:noisiness {:quality                (if (> saddles% 0.3)
                                             :very
                                             :slightly)
                   :recommended-resolution (ts/higher-resolution resolution)}})))

(defn variation-trend
  [{:keys [resolution series]}]
  (when resolution
    (let [trend (math/variation-trend (ts/period-length resolution) series)]
      (when (> trend 0.1)
        {:variation-trend {:mode (if (pos? trend)
                                   :increasing
                                   :decreasing)}}))))
