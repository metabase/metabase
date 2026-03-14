(ns metabase-enterprise.metabot-v3.stats.histogram
  "Histogram chart statistics."
  (:require
   [metabase-enterprise.metabot-v3.stats.types :as stats.types]
   [metabase-enterprise.metabot-v3.stats.util :as stats.u]
   [metabase.util.malli :as mu]
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

(def ^:private min-shape-metrics-points 8)

(defn- compute-percentiles
  "Compute percentiles map for a sequence of values."
  [values]
  (let [pcts [25 50 75 90 95 99]]
    (zipmap pcts (dfn/percentiles values pcts))))

(defn- compute-quartiles
  "Compute quartile stats from values."
  [values]
  (let [[_min q1 med q3 _max] (dfn/quartiles values)]
    {:q1     q1
     :median med
     :q3     q3
     :iqr    (- q3 q1)}))

(defn- nan->nil
  "Convert NaN to nil."
  [x]
  (when-not (Double/isNaN (double x))
    x))

(defn- compute-series-stats
  "Compute histogram stats for a single series.
  x_values are (bin edges/centers) and y_values are (counts/frequencies).
  Single-arity form uses sequential indices as x_values."
  ([y-values]
   (compute-series-stats (range (count y-values)) y-values))
  ([x-values y-values]
   (let [valid-pairs (filter (fn [[_ y]] (some? y)) (map vector x-values y-values))
         valid       (mapv (comp double second) valid-pairs)
         valid-xs    (mapv first valid-pairs)
         n           (count valid)]
     (if (zero? n)
       {:summary      {:min 0 :max 0 :mean 0 :median 0 :std_dev 0 :range 0}
        :data_points  0
        :bin_data     []
        :distribution {:percentiles {} :quartiles {:q1 0 :median 0 :q3 0 :iqr 0}}}
       (let [summary     (stats.u/compute-summary valid)
             percentiles (compute-percentiles valid)
             quartiles   (compute-quartiles valid)
             skewness    (when (>= n min-shape-metrics-points)
                           (nan->nil (dfn/skew valid)))
             kurtosis    (when (>= n min-shape-metrics-points)
                           (nan->nil (dfn/kurtosis valid)))]
         {:summary      summary
          :data_points  n
          :bin_data     (mapv vector valid-xs valid)
          :distribution (cond-> {:percentiles percentiles
                                 :quartiles   quartiles}
                          skewness (assoc :skewness skewness)
                          kurtosis (assoc :kurtosis kurtosis))})))))

(mu/defn compute-histogram-stats :- ::stats.types/histogram-stats
  "Compute statistics for histogram data."
  [series-data :- [:map-of :string ::stats.types/series-config]
   _opts       :- ::stats.types/options]
  (let [series-stats (stats.u/compute-series-with-labels series-data compute-series-stats)]
    (stats.u/make-chart-result :histogram series-data series-stats nil)))
