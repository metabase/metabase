(ns metabase-enterprise.metabot-v3.stats.categorical
  "Categorical chart statistics computation."
  (:require
   [metabase-enterprise.metabot-v3.stats.outliers :as outliers]
   [metabase-enterprise.metabot-v3.stats.time-series :as time-series]))

(set! *warn-on-reflection* true)

(def ^:private min-outlier-points 5)
(def ^:private top-n-categories 10)
(def ^:private bottom-n-categories 5)
(def ^:private many-categories-threshold 15)

(defn compute-series-stats
  "Compute categorical stats for a single series.
   x-values = category names (strings), y-values = numeric values."
  [x-values y-values]
  (let [pairs   (map vector x-values y-values)
        valid   (filter (fn [[_ v]] (some? v)) pairs)
        n       (count valid)
        ys      (mapv second valid)
        xs      (mapv first valid)]
    (if (zero? n)
      {:summary        nil
       :category_count 0
       :top_categories []
       :outliers       []}
      (let [summary  (time-series/compute-summary ys)
            outliers (when (>= n min-outlier-points)
                       (outliers/find-outliers ys (mapv str xs)))
            total    (reduce + 0.0 ys)
            sorted   (sort-by (fn [[_ v]] (- v)) valid)
            make-cat (fn [[cat-name val]]
                       {:name       (str cat-name)
                        :value      val
                        :percentage (if (pos? total) (* 100.0 (/ val total)) 0.0)})
            top-cats (mapv make-cat (take top-n-categories sorted))
            bot-cats (when (> (count sorted) many-categories-threshold)
                       (mapv make-cat (take-last bottom-n-categories sorted)))]
        (cond-> {:summary        summary
                 :category_count (count (distinct (remove nil? xs)))
                 :top_categories top-cats
                 :outliers       (or outliers [])}
          bot-cats (assoc :bottom_categories bot-cats))))))

(defn compute-categorical-stats
  "Compute categorical stats for all series in a chart.
   series-data: map of series-name -> {:x_values [...] :y_values [...]}"
  [series-data opts]
  (let [series-stats (into {}
                           (for [[series-name {:keys [x_values y_values]}] series-data]
                             [series-name (compute-series-stats x_values y_values)]))
        correlations (when (and (:deep? opts) (> (count series-data) 1))
                       (time-series/compute-correlations series-data))]
    (cond-> {:chart_type   :categorical
             :series_count (count series-data)
             :series       series-stats}
      correlations (assoc :correlations correlations))))
