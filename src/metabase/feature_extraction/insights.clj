(ns metabase.feature-extraction.insights
  "Data insights -- morsels of prepackaged analysis."
  (:require [bigml.histogram.core :as h]
            [metabase.feature-extraction
             [math :as math]
             [timeseries :as ts]]))

(defmacro definsight
  [name docs features & body]
  `(defn ~name ~docs
     [{:keys ~features}]
     (when-let [insight# (do ~@body)]
       {~(keyword name) insight#})))

(definsight normal-range
  [histogram]
  (let [{lower 0.25 upper 0.75} (h/percentiles histogram 0.25 0.75)]
    {:lower lower
     :upper upper}))

(definsight gaps
  [nil% field]
  (when (pos? nil%)
    {:mode :nils
     :quality (if (< nil% 0.1)
                :some
                :many)
     :filter [[:IS_NULL [:field-id (:id field)]]]}))

(definsight autocorrelation
  [series]
  (let [{:keys [autocorrelation lag]} (math/autocorrelation (map second series))]
    (when (> autocorrelation 0.3)
      {:quality (if (< autocorrelation 0.6)
                  :weak
                  :strong)
       :lag     lag})))

(definsight noisiness
  [series resolution]
  (let [saddles% (/ (math/saddles series) (max (count series) 1))]
    (when (> saddles% 0.1)
      {:quality                (if (> saddles% 0.3)
                                 :very
                                 :slightly)
       :recommended-resolution (ts/higher-resolution resolution)})))

(definsight variation-trend
  [resolution series]
  (when resolution
    (let [trend (math/variation-trend (ts/period-length resolution) series)]
      (when (> trend 0.1)
        {:mode (if (pos? trend)
                 :increasing
                 :decreasing)}))))
