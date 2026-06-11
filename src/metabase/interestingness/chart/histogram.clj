(ns metabase.interestingness.chart.histogram
  "Histogram chart statistics."
  (:require
   [metabase.interestingness.chart.types :as stats.types]
   [metabase.interestingness.chart.util :as stats.u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private min-shape-metrics-points 8)

;;; ------------------------------------------ Weighted Distribution Stats -------------------------------------------

(defn- weighted-moment
  "Weighted moment: Σ(count_i × (f x_i)) / Σ(count_i), where f transforms each value."
  [xs counts total f]
  (/ (double (reduce + (map (fn [x c]
                              (* c (f (double x))))
                            xs
                            counts)))
     (double total)))

(defn- weighted-mean
  "Weighted mean: Σ(x_i × count_i) / Σ(count_i)."
  [xs counts total]
  (weighted-moment xs counts total identity))

(defn- weighted-variance
  "Weighted variance: Σ(count_i × (x_i - mean)²) / Σ(count_i)."
  [xs counts total wmean]
  (weighted-moment xs counts total #(Math/pow (- % wmean) 2)))

(defn- weighted-skewness
  "Weighted skewness using bin centers. Returns nil when std_dev is zero."
  [xs counts total wmean wstd]
  (when (pos? wstd)
    (weighted-moment xs counts total #(Math/pow (/ (- % wmean) wstd) 3))))

(defn- weighted-kurtosis
  "Weighted excess kurtosis using bin centers. Returns nil when std_dev is zero."
  [xs counts total wmean wstd]
  (when (pos? wstd)
    (- (weighted-moment xs counts total #(Math/pow (/ (- % wmean) wstd) 4))
       3.0)))

;;; ----------------------------------------- Cumulative Percentile Estimation ----------------------------------------

(defn- cumulative-percentile
  "Estimate a percentile from sorted bins using linear interpolation between bin centers.
  `sorted-xs` and `cum-counts` are parallel vectors; `total` is the sum of all counts."
  [sorted-xs cum-counts total target-frac]
  (let [n (count sorted-xs)]
    (loop [i 0]
      (if (>= i n)
        (double (nth sorted-xs (dec n)))
        (let [cum-frac (/ (double (nth cum-counts i))
                          (double total))]
          (if (>= cum-frac target-frac)
            (if (zero? i)
              (double (nth sorted-xs 0))
              (let [prev-frac (/ (double (nth cum-counts (dec i)))
                                 (double total))
                    x-prev    (double (nth sorted-xs (dec i)))
                    x-curr    (double (nth sorted-xs i))
                    t         (if (== cum-frac prev-frac)
                                0.5
                                (/ (- target-frac prev-frac)
                                   (- cum-frac prev-frac)))]
                (+ x-prev (* t (- x-curr x-prev)))))
            (recur (inc i))))))))

(defn- compute-estimated-percentiles
  "Compute estimated percentiles from binned data using cumulative interpolation."
  [sorted-xs cum-counts total]
  (let [pcts [25 50 75 90 95 99]]
    (zipmap pcts
            (mapv #(cumulative-percentile sorted-xs cum-counts total (/ (double %) 100.0))
                  pcts))))

;;; -------------------------------------------- Structural Metrics ---------------------------------------------------

(defn- count-peaks
  "Count local maxima (peaks) in a sequence of counts."
  [counts]
  (let [n (count counts)]
    (if (<= n 2)
      (if (pos? n) 1 0)
      (count
       (for [i (range n)
             :let [prev (if (zero? i) -1 (nth counts (dec i)))
                   curr (nth counts i)
                   nxt  (if (= i (dec n)) -1 (nth counts (inc i)))]
             :when (and (> curr prev) (>= curr nxt))]
         i)))))

(defn- count-gaps
  "Count zero-count bins between non-zero bins."
  [counts]
  (let [n (count counts)]
    (if (<= n 2)
      0
      (let [first-nz (some #(when (pos? (nth counts %)) %) (range n))
            last-nz  (some #(when (pos? (nth counts %)) %) (reverse (range n)))]
        (if (or (nil? first-nz) (nil? last-nz) (>= first-nz last-nz))
          0
          (count (filter #(zero? (nth counts %))
                         (range (inc first-nz) last-nz))))))))

;;; --------------------------------------------- Series Stats -------------------------------------------------------

(defn- compute-series-stats
  "Compute histogram stats for a single series using weighted approximations.
  x_values are bin edges/centers and y_values are counts/frequencies.
  Single-arity form uses sequential indices as x_values."
  ([y-values]
   (compute-series-stats (range (count y-values)) y-values))
  ([x-values y-values]
   (let [valid-pairs (filter (fn [[_ y]] (some? y)) (map vector x-values y-values))
         valid-xs    (mapv (comp double first) valid-pairs)
         valid-ys    (mapv (comp double second) valid-pairs)
         n           (count valid-pairs)
         total       (reduce + 0.0 valid-ys)]
     (if (or (zero? n)
             (zero? total))
       {:estimated-summary {:weighted-mean 0 :weighted-std-dev 0 :data-range 0}
        :total-count       0
        :data-points       n
        :bin-data          []
        :distribution      {:estimated-percentiles {}
                            :estimated-quartiles   {:q1 0 :median 0 :q3 0 :iqr 0}}
        :structure         {:mode-bin           nil
                            :peak-count         0
                            :concentration-top3 0.0
                            :gap-count          0
                            :empty-bin-ratio    0.0
                            :bin-count          n}}
       (let [;; Sort by x for cumulative operations
             sorted-pairs (sort-by first (map vector valid-xs valid-ys))
             sorted-xs    (mapv first sorted-pairs)
             sorted-ys    (mapv second sorted-pairs)
             cum-counts   (vec (reductions + sorted-ys))
             ;; Weighted summary
             wmean        (weighted-mean sorted-xs sorted-ys total)
             wvar         (weighted-variance sorted-xs sorted-ys total wmean)
             wstd         (Math/sqrt wvar)
             min-x        (first sorted-xs)
             max-x        (last sorted-xs)
             ;; Distribution estimates
             percentiles  (compute-estimated-percentiles sorted-xs cum-counts total)
             q1           (get percentiles 25)
             med          (get percentiles 50)
             q3           (get percentiles 75)
             ;; Shape metrics (weighted)
             wskew        (when (>= n min-shape-metrics-points)
                            (stats.u/nan->nil (or (weighted-skewness sorted-xs sorted-ys total wmean wstd) ##NaN)))
             wkurt        (when (>= n min-shape-metrics-points)
                            (stats.u/nan->nil (or (weighted-kurtosis sorted-xs sorted-ys total wmean wstd) ##NaN)))
             ;; Structural metrics
             max-count    (apply max sorted-ys)
             mode-idx     (.indexOf ^java.util.List sorted-ys max-count)
             top3         (reduce + (take 3 (sort > sorted-ys)))
             zero-bins    (count (filter zero? sorted-ys))]
         {:estimated-summary {:weighted-mean    wmean
                              :weighted-std-dev wstd
                              :data-range       (- max-x min-x)}
          :total-count       (long total)
          :data-points       n
          :bin-data          (mapv vector sorted-xs sorted-ys)
          :distribution      (cond-> {:estimated-percentiles percentiles
                                      :estimated-quartiles   {:q1 q1 :median med :q3 q3 :iqr (- q3 q1)}}
                               wskew (assoc :weighted-skewness wskew)
                               wkurt (assoc :weighted-kurtosis wkurt))
          :structure         {:mode-bin           [(nth sorted-xs mode-idx) max-count]
                              :peak-count         (count-peaks sorted-ys)
                              :concentration-top3 (/ top3 total)
                              :gap-count          (count-gaps sorted-ys)
                              :empty-bin-ratio    (/ (double zero-bins) n)
                              :bin-count          n}})))))

(mu/defn compute-histogram-stats :- ::stats.types/histogram-stats
  "Compute statistics for histogram data.
  Computes weighted approximations of distribution statistics from binned (bin_position, count) data, plus structural
  metrics about the histogram shape."
  [series-data :- [:map-of :string ::stats.types/series-config]
   _opts       :- ::stats.types/options]
  (let [series-stats (stats.u/compute-series-with-labels series-data compute-series-stats)]
    (stats.u/make-chart-result :histogram series-data series-stats nil)))
