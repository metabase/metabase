(ns metabase-enterprise.metabot-v3.stats.scatter
  "Scatter plot statistics computation."
  (:require
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

(def ^:private min-regression-points 3)
(def ^:private min-correlation-points 2)

(defn- correlation-strength [coef]
  (let [abs-coef (Math/abs (double coef))]
    (cond
      (>= abs-coef 0.7) :strong
      (>= abs-coef 0.3) :moderate
      :else :weak)))

(defn compute-series-stats
  "Compute stats for a single scatter series.
  x-values and y-values are parallel sequences of numbers."
  [x-values y-values]
  (let [valid-pairs (filter (fn [[x y]] (and (some? x) (some? y)))
                            (map vector x-values y-values))
        n           (count valid-pairs)]
    (if (< n min-correlation-points)
      {:x_summary   nil
       :y_summary   nil
       :data_points n}
      (let [xs        (mapv (comp double first) valid-pairs)
            ys        (mapv (comp double second) valid-pairs)
            x-min     (dfn/reduce-min xs)
            x-max     (dfn/reduce-max xs)
            y-min     (dfn/reduce-min ys)
            y-max     (dfn/reduce-max ys)
            x-summary {:min     x-min
                       :max     x-max
                       :mean    (dfn/mean xs)
                       :median  (dfn/median xs)
                       :std_dev (dfn/standard-deviation xs)
                       :range   (- x-max x-min)}
            y-summary {:min     y-min
                       :max     y-max
                       :mean    (dfn/mean ys)
                       :median  (dfn/median ys)
                       :std_dev (dfn/standard-deviation ys)
                       :range   (- y-max y-min)}
            raw-coef  (dfn/pearsons-correlation xs ys)
            coef      (when-not (Double/isNaN (double raw-coef)) raw-coef)
            correlation (when coef
                          {:coefficient coef
                           :strength    (correlation-strength coef)
                           :direction   (if (neg? coef) :negative :positive)})
            regression  (when (>= n min-regression-points)
                          (try
                            (let [regressor (dfn/linear-regressor xs ys)
                                  slope     (:slope (meta regressor))
                                  intercept (- (dfn/mean ys) (* slope (dfn/mean xs)))
                                  r-squared (* (double raw-coef) (double raw-coef))]
                              {:slope     slope
                               :intercept intercept
                               :r_squared r-squared})
                            (catch Exception _ nil)))]
        (cond-> {:x_summary   x-summary
                 :y_summary   y-summary
                 :data_points n}
          correlation (assoc :correlation correlation)
          regression  (assoc :regression regression))))))

(defn compute-scatter-stats
  "Compute scatter stats for all series in a chart.
  series-data: map of series-name -> {:x_values [...] :y_values [...]}"
  [series-data _opts]
  (let [series-stats (into {}
                           (for [[series-name {:keys [x_values y_values]}] series-data]
                             [series-name (compute-series-stats x_values y_values)]))]
    {:chart_type   :scatter
     :series_count (count series-data)
     :series       series-stats}))
