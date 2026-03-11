(ns metabase-enterprise.metabot-v3.stats.histogram
  "Histogram chart statistics computation."
  (:require
   [metabase-enterprise.metabot-v3.stats.time-series :as time-series]))

(set! *warn-on-reflection* true)

(def ^:private min-shape-metrics-points 8)
(def ^:private skewness-threshold 0.5)

(defn- compute-percentile
  "Compute a percentile of sorted values using linear interpolation. pct: 0-100."
  [sorted-vals pct]
  (let [n (count sorted-vals)]
    (if (= n 1)
      (first sorted-vals)
      (let [idx   (* (/ pct 100.0) (dec n))
            lower (int (Math/floor idx))
            upper (int (Math/ceil idx))
            frac  (- idx lower)]
        (+ (* (- 1.0 frac) (nth sorted-vals lower))
           (* frac (nth sorted-vals upper)))))))

(defn- compute-percentiles
  "Compute percentiles map for a sorted sequence of values."
  [sorted-vals]
  (into {}
        (for [pct [25 50 75 90 95 99]]
          [pct (compute-percentile sorted-vals pct)])))

(defn- compute-quartiles
  "Compute quartile stats from sorted values."
  [sorted-vals]
  (let [q1  (compute-percentile sorted-vals 25)
        med (compute-percentile sorted-vals 50)
        q3  (compute-percentile sorted-vals 75)]
    {:q1     q1
     :median med
     :q3     q3
     :iqr    (- q3 q1)}))

(defn- compute-skewness
  "Compute adjusted Fisher-Pearson skewness coefficient."
  [values mean-val std-dev n]
  (when (and (>= n 3) (pos? std-dev))
    (let [cubed-zscores (map (fn [x] (Math/pow (/ (- (double x) mean-val) std-dev) 3)) values)
          sum-cubed     (reduce + 0.0 cubed-zscores)]
      (* (/ (* n (double sum-cubed))
            (* (dec n) (- n 2)))
         1.0))))

(defn- compute-excess-kurtosis
  "Compute Fisher's excess kurtosis (normal distribution = 0)."
  [values mean-val std-dev n]
  (when (and (>= n 4) (pos? std-dev))
    (let [fourth-zscores (map (fn [x] (Math/pow (/ (- (double x) mean-val) std-dev) 4)) values)
          sum-fourth     (reduce + 0.0 fourth-zscores)
          term1          (/ (* n (inc n) sum-fourth)
                            (* (dec n) (- n 2) (- n 3)))
          term2          (/ (* 3.0 (Math/pow (dec n) 2))
                            (* (- n 2) (- n 3)))]
      (- term1 term2))))

(defn compute-series-stats
  "Compute histogram stats for a single series using its y_values (counts/frequencies)
  and x_values (bin edges/centers) for display.

  Single-arity form accepts only y_values and uses sequential indices as x_values."
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
       (let [summary     (time-series/compute-summary valid)
             sorted-vals (sort valid)
             percentiles (compute-percentiles sorted-vals)
             quartiles   (compute-quartiles sorted-vals)
             mean-val    (:mean summary)
             std-dev     (:std_dev summary)
             skewness    (when (>= n min-shape-metrics-points)
                           (compute-skewness valid mean-val std-dev n))
             kurtosis    (when (>= n min-shape-metrics-points)
                           (compute-excess-kurtosis valid mean-val std-dev n))]
         {:summary      summary
          :data_points  n
          :bin_data     (mapv vector valid-xs valid)
          :distribution (cond-> {:percentiles percentiles
                                 :quartiles   quartiles}
                          skewness (assoc :skewness skewness)
                          kurtosis (assoc :kurtosis kurtosis))})))))

(defn compute-histogram-stats
  "Compute statistics for histogram data. Uses y_values (counts/frequencies per bin).
  series-data: map of series-name -> {:x_values [...] :y_values [...] :x {:name ...} :y {:name ...}}"
  [series-data _opts]
  (let [series-stats (into {}
                           (for [[series-name {:keys [x_values y_values x y]}] series-data]
                             [series-name (-> (compute-series-stats x_values y_values)
                                              (assoc :x_name (some-> x :name))
                                              (assoc :y_name (some-> y :name)))]))]
    {:chart_type   :histogram
     :series_count (count series-data)
     :series       series-stats}))
