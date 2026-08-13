(ns metabase.interestingness.chart.util
  "Shared utilities used across various stats chart types."
  (:require
   [metabase.interestingness.chart.types :as stats.types]
   [metabase.util.malli :as mu]
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

(mu/defn nan->nil :- [:maybe number?]
  "Convert NaN to nil, pass through other values."
  [x :- number?]
  (when-not (Double/isNaN (double x))
    x))

(mu/defn compute-summary :- ::stats.types/series-summary
  "Compute basic statistical summary for a series of values."
  [values :- [:sequential number?]]
  (let [min-val (dfn/reduce-min values)
        max-val (dfn/reduce-max values)]
    {:min min-val
     :max max-val
     :mean (dfn/mean values)
     :median (dfn/median values)
     :std-dev (dfn/standard-deviation values)
     :range (- max-val min-val)}))

(mu/defn correlation-direction :- ::stats.types/correlation-direction
  "Classify correlation coefficient direction as :positive/:negative/:none."
  [coef :- number?]
  (cond
    (neg? coef) :negative
    (pos? coef) :positive
    :else       :none))

(mu/defn correlation-strength :- ::stats.types/correlation-strength
  "Classify correlation coefficient into :strong/:moderate/:weak/:none."
  [coef :- number?]
  (let [abs-coef (Math/abs (double coef))]
    (cond
      (>= abs-coef 0.7) :strong
      (>= abs-coef 0.4) :moderate
      (>= abs-coef 0.2) :weak
      :else :none)))

(defn- align-series-on-x
  "Align two series on common x-values using listwise deletion.
  Returns [aligned-vals-a aligned-vals-b] containing only values at shared x positions."
  [x-vals-a y-vals-a x-vals-b y-vals-b]
  (let [b-lookup (zipmap x-vals-b y-vals-b)
        common-pairs (for [[x y-a] (map vector x-vals-a y-vals-a)
                           :let [y-b (get b-lookup x)]
                           :when (some? y-b)]
                       [y-a y-b])]
    [(mapv first common-pairs)
     (mapv second common-pairs)]))

(def ^:private min-correlation-sample-size
  "Minimum sample size required for meaningful correlation computation."
  10)

(mu/defn ^:private compute-correlations :- [:sequential ::stats.types/correlation]
  "Compute pairwise correlations between multiple series.
  Aligns series on common x-values (listwise deletion) before computing correlation.
  Skips pairs with fewer than 10 aligned data points."
  [series-map :- [:map-of :string ::stats.types/series-config]]
  (let [series-names (keys series-map)
        pairs (for [a series-names
                    b series-names
                    :when (pos? (compare (str b) (str a)))]
                [a b])]
    (vec
     (for [[name-a name-b] pairs
           :let [{x-a :x_values y-a :y_values} (get series-map name-a)
                 {x-b :x_values y-b :y_values} (get series-map name-b)
                 [aligned-a aligned-b] (align-series-on-x x-a y-a x-b y-b)
                 n (count aligned-a)]
           :when (>= n min-correlation-sample-size)
           :let [coef (dfn/pearsons-correlation aligned-a aligned-b)]]
       {:series-a name-a
        :series-b name-b
        :coefficient coef
        :strength (correlation-strength coef)
        :direction (correlation-direction coef)
        :aligned-sample-size n}))))

(mu/defn maybe-compute-correlations :- [:maybe [:sequential ::stats.types/correlation]]
  "Compute pairwise correlations if deep mode is enabled and there are multiple series.
  Respects :max-correlation-series opt to cap the number of series considered."
  [series-data :- [:map-of :string ::stats.types/series-config]
   opts :- ::stats.types/options]
  (when (and (:deep? opts) (> (count series-data) 1))
    (let [capped (if-let [max-k (:max-correlation-series opts)]
                   (into {} (take max-k series-data))
                   series-data)]
      (when (> (count capped) 1)
        (compute-correlations capped)))))

(mu/defn percentage-change :- :double
  "Compute percentage change from `from-val` to `to-val`.
  Returns 0.0 when from-val is zero to avoid division by zero."
  [from-val :- number?
   to-val :- number?]
  (if (zero? from-val)
    0.0
    (* 100.0 (/ (- to-val from-val) (Math/abs (double from-val))))))

(defn compute-series-with-labels
  "Apply `compute-fn` to each series' x_values and y_values, attaching :x-name and :y-name
  from column metadata. `compute-fn` is called on x_values and y_values for each series.
  Returns a map of series-name -> stats-with-labels."
  [series-data compute-fn]
  (into {}
        (for [[series-name {:keys [x_values y_values x y]}] series-data]
          [series-name (-> (compute-fn x_values y_values)
                           (assoc :x-name (some-> x :name))
                           (assoc :y-name (some-> y :name)))])))

(mu/defn make-chart-result :- ::stats.types/chart-stats
  "Build the standard chart stats result map."
  [chart-type series-data series-stats correlations]
  (cond-> {:chart-type   chart-type
           :series-count (count series-data)
           :series       series-stats}
    correlations (assoc :correlations correlations)))
