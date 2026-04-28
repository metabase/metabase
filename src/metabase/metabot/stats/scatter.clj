(ns metabase.metabot.stats.scatter
  "Scatter plot statistics."
  (:require
   [metabase.metabot.stats.outliers :as outliers]
   [metabase.metabot.stats.types :as stats.types]
   [metabase.metabot.stats.util :as stats.u]
   [metabase.util.malli :as mu]
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

(def ^:private min-regression-points 3)
(def ^:private min-correlation-points 2)
(def ^:private min-outlier-points 5)
(def ^:private max-sample-points 30)

(defn- sample-points
  "Randomly sample up to max-points items from a collection."
  [coll max-points]
  (if (<= (count coll) max-points)
    (vec coll)
    (vec (take max-points (shuffle coll)))))

(defn- compute-series-stats
  "Compute stats for a single scatter series."
  [x-values y-values]
  (let [valid-pairs (filter (fn [[x y]] (and (some? x) (some? y)))
                            (map vector x-values y-values))
        n           (count valid-pairs)]
    (if (< n min-correlation-points)
      {:x-summary   nil
       :y-summary   nil
       :data-points n}
      (let [xs               (mapv (comp double first) valid-pairs)
            ys               (mapv (comp double second) valid-pairs)
            x-summary        (stats.u/compute-summary xs)
            y-summary        (stats.u/compute-summary ys)
            raw-coef         (dfn/pearsons-correlation xs ys)
            coef             (stats.u/nan->nil raw-coef)
            correlation      (when coef
                               {:coefficient coef
                                :strength    (stats.u/correlation-strength coef)
                                :direction   (stats.u/correlation-direction coef)})
            regression       (when (>= n min-regression-points)
                               (try
                                 (let [regressor (dfn/linear-regressor xs ys)
                                       slope     (:slope (meta regressor))
                                       intercept (- (dfn/mean ys) (* slope (dfn/mean xs)))
                                       r-squared (* (double raw-coef) (double raw-coef))]
                                   {:slope     slope
                                    :intercept intercept
                                    :r-squared r-squared})
                                 (catch Exception _ nil)))
            scatter-outliers (when (>= n min-outlier-points)
                               (outliers/find-outliers ys xs))
            sampled-points   (sample-points (mapv vector xs ys) max-sample-points)]
        (cond-> {:x-summary      x-summary
                 :y-summary      y-summary
                 :data-points    n
                 :sampled-points sampled-points}
          correlation            (assoc :correlation correlation)
          regression             (assoc :regression regression)
          (seq scatter-outliers) (assoc :outliers scatter-outliers))))))

(mu/defn compute-scatter-stats :- ::stats.types/scatter-stats
  "Compute scatter stats for all series in a chart."
  [series-data :- [:map-of :string ::stats.types/series-config]
   _opts       :- ::stats.types/options]
  (let [series-stats (stats.u/compute-series-with-labels series-data compute-series-stats)]
    (stats.u/make-chart-result :scatter series-data series-stats nil)))
