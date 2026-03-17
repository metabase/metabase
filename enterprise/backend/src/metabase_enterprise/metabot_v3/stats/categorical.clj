(ns metabase-enterprise.metabot-v3.stats.categorical
  "Categorical chart statistics."
  (:require
   [metabase-enterprise.metabot-v3.stats.outliers :as outliers]
   [metabase-enterprise.metabot-v3.stats.types :as stats.types]
   [metabase-enterprise.metabot-v3.stats.util :as stats.u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private min-outlier-points 5)
(def ^:private top-n-categories 10)
(def ^:private bottom-n-categories 5)
(def ^:private many-categories-threshold 15)

(defn- compute-series-stats
  "Compute categorical stats for a single series.
  x-values are category names (strings), y-values are numeric values.
  Duplicate category names are merged by summing their values."
  [x-values y-values]
  (let [pairs   (map vector x-values y-values)
        valid   (filter (fn [[k v]] (and (some? k) (some? v))) pairs)
        grouped (reduce (fn [acc [k v]] (update acc k (fnil + 0) v)) {} valid)
        agg     (vec grouped)
        n       (count agg)]
    (if (zero? n)
      {:summary        nil
       :data_points    0
       :category_count 0
       :top_categories []
       :outliers       []}
      (let [ys       (mapv second agg)
            xs       (mapv first agg)
            summary  (stats.u/compute-summary ys)
            outliers (when (>= n min-outlier-points)
                       (outliers/find-outliers ys (mapv str xs)))
            all-non-negative? (every? #(not (neg? %)) ys)
            total             (when all-non-negative? (reduce + 0.0 ys))
            sorted            (sort-by (fn [[_ v]] (- v)) agg)
            make-cat          (fn [[cat-name value]]
                                (cond-> {:name  (str cat-name)
                                         :value value}
                                  total (assoc :percentage (* 100.0 (/ value total)))))
            bottom   (when (> n many-categories-threshold)
                       (mapv make-cat (take-last bottom-n-categories sorted)))]
        (cond-> {:summary        summary
                 :data_points    (count valid)
                 :category_count n
                 :top_categories (mapv make-cat (take top-n-categories sorted))
                 :outliers       (or outliers [])}
          bottom (assoc :bottom_categories bottom))))))

(mu/defn compute-categorical-stats :- ::stats.types/categorical-stats
  "Compute categorical stats for all series in a chart."
  [series-data :- [:map-of :string ::stats.types/series-config]
   opts        :- ::stats.types/options]
  (let [series-stats (stats.u/compute-series-with-labels series-data compute-series-stats)
        correlations (stats.u/maybe-compute-correlations series-data opts)]
    (stats.u/make-chart-result :categorical series-data series-stats correlations)))
