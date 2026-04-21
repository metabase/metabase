(ns metabase.interestingness.chart
  "Chart-level interestingness scoring.

   Operates on the same `chart-config` shape that
   [[metabase.interestingness.chart.stats/compute-chart-stats]] consumes —
   `{:series {name -> {:x :y :x_values :y_values ...}} :display_type ...}` —
   and returns a scalar score in `[0.0, 1.0]` describing how likely the chart
   is to surface a useful insight.

   The score blends three signal groups:
   - **non-degeneracy**: hard gate against flat measures and single-value
     dimensions (a chart no aggregation can rescue)
   - **statistical signal**: presence of trend, outliers, correlations, peaks
     in the distribution — read from the stats map
   - **structure**: reasonable category count, non-trivial data-point count

   Callers who already compute stats can pass them via the 2-arity form to
   avoid recomputation."
  (:require
   [metabase.interestingness.chart.stats :as chart.stats]))

(set! *warn-on-reflection* true)

(defn- variance
  [xs]
  (let [n (count xs)]
    (when (pos? n)
      (let [mean (/ (double (reduce + 0.0 xs)) n)]
        (/ (reduce + 0.0 (map #(let [d (- % mean)] (* d d)) xs)) n)))))

(defn- flat?
  "True if the series' y_values have effectively zero spread."
  [{:keys [y_values]}]
  (let [v (variance y_values)]
    (or (nil? v) (< v 1e-12))))

(defn- single-valued-x?
  [{:keys [x_values]}]
  (<= (count (distinct x_values)) 1))

(defn- non-degeneracy-score
  "0 if every series is flat or has a single x; softer penalty if any one is.
   1 when all series look lively."
  [{:keys [series]}]
  (if (empty? series)
    0.0
    (let [configs      (vals series)
          all-flat?    (every? flat? configs)
          any-flat?    (some flat? configs)
          all-single?  (every? single-valued-x? configs)
          any-single?  (some single-valued-x? configs)]
      (cond
        (or all-flat? all-single?) 0.0
        (or any-flat? any-single?) 0.4
        :else                      1.0))))

(defmulti ^:private signal-score
  "Read statistical signals from a computed stats map. Returns 0..1."
  {:arglists '([stats])}
  :chart-type)

(defn- trend-interesting?
  [{:keys [direction overall-change-pct]}]
  (or (contains? #{:strongly-increasing :strongly-decreasing} direction)
      (and (contains? #{:increasing :decreasing} direction)
           (some-> overall-change-pct double abs (>= 5.0)))))

(defmethod signal-score :time-series
  [{:keys [series correlations]}]
  (if (empty? series)
    0.0
    (let [per-series (for [[_ s] series]
                       (let [has-trend   (some-> (:trend s) trend-interesting?)
                             has-outlier (seq (:outliers s))
                             has-change  (seq (:significant-changes s))
                             volatile?   (contains? #{:high :extreme}
                                                    (some-> (:volatility s) :level))]
                         (cond-> 0.0
                           has-trend   (+ 0.4)
                           has-outlier (+ 0.25)
                           has-change  (+ 0.2)
                           volatile?   (+ 0.15))))
          base       (/ (reduce + 0.0 per-series) (count per-series))
          corr-bonus (if (some #(= :strong (:strength %)) correlations) 0.15 0.0)]
      (min 1.0 (+ base corr-bonus)))))

(defmethod signal-score :categorical
  [{:keys [series]}]
  (if (empty? series)
    0.0
    (let [scores (for [[_ s] series]
                   (let [cc          (:category-count s 0)
                         has-outlier (seq (:outliers s))
                         range-ratio (when-let [{:keys [min max]} (:summary s)]
                                       (when (and min max (pos? (Math/abs (double max))))
                                         (/ (- (double max) (double min))
                                            (Math/abs (double max)))))]
                     (cond-> 0.0
                       (<= 3 cc 50)    (+ 0.4)
                       (< 50 cc 200)   (+ 0.2)
                       has-outlier     (+ 0.2)
                       (and range-ratio (> range-ratio 0.25)) (+ 0.25))))]
      (min 1.0 (/ (reduce + 0.0 scores) (count scores))))))

(defmethod signal-score :scatter
  [{:keys [series]}]
  (if (empty? series)
    0.0
    (let [scores (for [[_ s] series]
                   (let [coef (some-> s :correlation :coefficient double abs)
                         r2   (some-> s :regression :r-squared double)
                         has-outlier (seq (:outliers s))]
                     (cond-> 0.0
                       (and coef (>= coef 0.7)) (+ 0.5)
                       (and coef (< 0.4 coef 0.7)) (+ 0.3)
                       (and r2 (>= r2 0.3))     (+ 0.2)
                       has-outlier              (+ 0.15))))]
      (min 1.0 (/ (reduce + 0.0 scores) (count scores))))))

(defmethod signal-score :histogram
  [{:keys [series]}]
  (if (empty? series)
    0.0
    (let [scores (for [[_ s] series]
                   (let [{:keys [peak-count concentration-top3]} (:structure s)
                         skew (some-> s :distribution :weighted-skewness double abs)]
                     (cond-> 0.0
                       (and peak-count (>= peak-count 2)) (+ 0.35)
                       (and concentration-top3 (> concentration-top3 0.5)) (+ 0.25)
                       (and skew (> skew 1.0))            (+ 0.3))))]
      (min 1.0 (/ (reduce + 0.0 scores) (count scores))))))

(defmethod signal-score :default
  [_]
  0.2)

(defn- structure-score
  "Reward reasonable data shape (enough points, not too many empty series)."
  [chart-config]
  (let [configs (vals (:series chart-config))
        point-counts (map #(count (:y_values %)) configs)
        total        (reduce + 0 point-counts)]
    (cond
      (empty? configs)  0.0
      (< total 3)       0.1
      (< total 10)      0.5
      (< total 10000)   1.0
      :else             0.8)))

(defn chart-interestingness
  "Compute a `[0.0, 1.0]` interestingness score for a chart.

   `chart-config` is the same map shape consumed by
   [[metabase.interestingness.chart.stats/compute-chart-stats]]. Optional
   `stats` lets callers who already computed stats avoid recomputation."
  ([chart-config]
   (chart-interestingness chart-config
                          (chart.stats/compute-chart-stats chart-config {})))
  ([chart-config stats]
   (let [nd (non-degeneracy-score chart-config)]
     (if (zero? nd)
       0.0
       (let [sig    (signal-score stats)
             struct (structure-score chart-config)]
         (min 1.0
              (max 0.0
                   (+ (* 0.3 nd)
                      (* 0.5 sig)
                      (* 0.2 struct)))))))))
