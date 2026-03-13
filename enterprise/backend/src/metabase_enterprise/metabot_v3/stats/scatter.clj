(ns metabase-enterprise.metabot-v3.stats.scatter
  "Scatter plot statistics."
  (:require
   [metabase-enterprise.metabot-v3.stats.outliers :as outliers]
   [metabase-enterprise.metabot-v3.stats.util :as stats.u]
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

(defn compute-series-stats
  "Compute stats for a single scatter series."
  [x-values y-values]
  (let [valid-pairs (filter (fn [[x y]] (and (some? x) (some? y)))
                            (map vector x-values y-values))
        n           (count valid-pairs)]
    (if (< n min-correlation-points)
      {:x_summary   nil
       :y_summary   nil
       :data_points n}
      (let [xs               (mapv (comp double first) valid-pairs)
            ys               (mapv (comp double second) valid-pairs)
            x-summary        (stats.u/compute-summary xs)
            y-summary        (stats.u/compute-summary ys)
            raw-coef         (dfn/pearsons-correlation xs ys)
            coef             (when-not (Double/isNaN (double raw-coef)) raw-coef)
            correlation      (when coef
                               {:coefficient coef
                                :strength    (stats.u/correlation-strength coef)
                                :direction   (if (neg? coef) :negative :positive)})
            regression       (when (>= n min-regression-points)
                               (try
                                 (let [regressor (dfn/linear-regressor xs ys)
                                       slope     (:slope (meta regressor))
                                       intercept (- (dfn/mean ys) (* slope (dfn/mean xs)))
                                       r-squared (* (double raw-coef) (double raw-coef))]
                                   {:slope     slope
                                    :intercept intercept
                                    :r_squared r-squared})
                                 (catch Exception _ nil)))
            ;; Pass numeric xs as "dates" so each outlier map carries the x-value in :date
            scatter-outliers (when (>= n min-outlier-points)
                               (outliers/find-outliers ys xs))
            sampled-points   (sample-points (mapv vector xs ys) max-sample-points)]
        (cond-> {:x_summary      x-summary
                 :y_summary      y-summary
                 :data_points    n
                 :sampled_points sampled-points}
          correlation            (assoc :correlation correlation)
          regression             (assoc :regression regression)
          (seq scatter-outliers) (assoc :outliers scatter-outliers))))))

(defn compute-scatter-stats
  "Compute scatter stats for all series in a chart."
  [series-data _opts]
  (let [series-stats (stats.u/compute-series-with-labels series-data compute-series-stats)]
    (stats.u/make-chart-result :scatter series-data series-stats nil)))
