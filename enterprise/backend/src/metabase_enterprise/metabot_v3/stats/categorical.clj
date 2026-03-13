(ns metabase-enterprise.metabot-v3.stats.categorical
  "Categorical chart statistics."
  (:require
   [metabase-enterprise.metabot-v3.stats.outliers :as outliers]
   [metabase-enterprise.metabot-v3.stats.util :as stats.u]))

(set! *warn-on-reflection* true)

(def ^:private min-outlier-points 5)
(def ^:private top-n-categories 10)
(def ^:private bottom-n-categories 5)
(def ^:private many-categories-threshold 15)

(defn compute-series-stats
  "Compute categorical stats for a single series.
  x-values are category names (strings), y-values are numeric values."
  [x-values y-values]
  (let [pairs (map vector x-values y-values)
        valid (filter (fn [[_ v]] (some? v)) pairs)
        n     (count valid)
        ys    (mapv second valid)
        xs    (mapv first valid)]
    (if (zero? n)
      {:summary        nil
       :category_count 0
       :top_categories []
       :outliers       []}
      (let [summary  (stats.u/compute-summary ys)
            outliers (when (>= n min-outlier-points)
                       (outliers/find-outliers ys (mapv str xs)))
            total    (reduce + 0.0 ys)
            sorted   (sort-by (fn [[_ v]] (- v)) valid)
            make-cat (fn [[cat-name value]]
                       {:name       (str cat-name)
                        :value      value
                        :percentage (if (pos? total) (* 100.0 (/ value total)) 0.0)})
            bottom   (when (> (count sorted) many-categories-threshold)
                       (mapv make-cat (take-last bottom-n-categories sorted)))]
        (cond-> {:summary        summary
                 :category_count (count (distinct (remove nil? xs)))
                 :top_categories (mapv make-cat (take top-n-categories sorted))
                 :outliers       (or outliers [])}
          bottom (assoc :bottom_categories bottom))))))

(defn compute-categorical-stats
  "Compute categorical stats for all series in a chart."
  [series-data opts]
  (let [series-stats (stats.u/compute-series-with-labels series-data compute-series-stats)
        correlations (stats.u/maybe-compute-correlations series-data opts)]
    (stats.u/make-chart-result :categorical series-data series-stats correlations)))
