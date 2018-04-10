(ns metabase.feature-extraction.feature-extractors
  "Feature extractors for various models."
  (:require [bigml.histogram.core :as h.impl]
            [kixi.stats.core :as stats :refer [somef]]
            [medley.core :as m]
            [metabase.feature-extraction
             [costs :as costs]
             [histogram :as h]
             [insights :as insights]
             [math :as math :refer [safe-divide]]
             [timeseries :as ts]
             [values :as values]]
            [metabase.models.field :as field]
            [metabase.query-processor.middleware.binning :as binning]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [net.cgrand.xforms :as x]
            [redux.core :as redux]
            [toucan.db :as db])
  (:import com.clearspring.analytics.stream.cardinality.HyperLogLogPlus))

(defn rollup
  "Transducer that groups by `groupfn` and reduces each group with `f`.
   Note the constructor airity of `f` needs to be free of side effects."
  [f groupfn]
  (let [init (f)]
    (fn
      ([] (transient {}))
      ([acc]
       (into {}
         (map (fn [[k v]]
                [k (f v)]))
         (persistent! acc)))
      ([acc x]
       (let [k (groupfn x)]
         (assoc! acc k (f (get acc k init) x)))))))

(defn- merge-juxt
  [& fns]
  (fn [x]
    (apply merge ((apply juxt (remove nil? fns)) x))))

(def ^:private ^:const ^Double cardinality-error 0.01)

(defn cardinality
  "Transducer that sketches cardinality using HyperLogLog++.
   https://research.google.com/pubs/pub40671.html"
  ([] (HyperLogLogPlus. 14 25))
  ([^HyperLogLogPlus acc] (.cardinality acc))
  ([^HyperLogLogPlus acc x]
   (.offer acc x)
   acc))

(defn- nice-bins
  [histogram]
  (cond
    (h/categorical? histogram) (h/equidistant-bins histogram)
    (h/empty? histogram)       []
    :else
    (let [{:keys [min max]} (h.impl/bounds histogram)]
      (if (= min max)
        [[min 1.0]]
        (let [{:keys [min-value max-value bin-width]}
              (binning/nicer-breakout
               {:min-value min
                :max-value max
                :num-bins  (->> histogram
                                h/optimal-bin-width
                                (binning/calculate-num-bins min max))
                :strategy  :num-bins})]
          (h/equidistant-bins min-value max-value bin-width histogram))))))

(defn- largest-triangle
  "Find the point in `points` that frorms the largest triangle with verteices
   `a` and `b`."
  [a b points]
  (apply max-key (partial math/triangle-area a b) points))

(defn largest-triangle-three-buckets
  "Downsample series `series` to (approximately) `target-size` data points using
   Largest-Triangle-Three-Buckets algorithm. Series needs to be at least
   2*`target-size` long for the algorithm to make sense. If it is not, the
   original series is returned.

   Note: this is true downsampling (selecting just some points), with no
   smoothing performed.
   https://skemman.is/bitstream/1946/15343/3/SS_MSthesis.pdf"
  [target-size series]
  (let [current-size (count series)]
    (if (< current-size (* 2 target-size))
      series
      (let [[head & body] series
            tail          (last body)
            body          (butlast body)
            bucket-size   (-> (/ current-size target-size) Math/floor int)]
        (transduce (x/partition 2 1 (x/into []))
                   (fn
                     ([] [head])
                     ([points] (conj points tail))
                     ([points [middle right]]
                      (conj points (largest-triangle (last points)
                                                     (math/centroid right)
                                                     middle))))
                   (conj (partition bucket-size body) [tail]))))))

(defn saddles
  "Returns the number of saddles in a given series."
  [series]
  (->> series
       (partition 2 1)
       (partition-by (fn [[[_ y1] [_ y2]]]
                       (>= y2 y1)))
       rest
       count))

; The largest dataset returned will be 2*target-1 points as we need at least
; 2 points per bucket for downsampling to have any effect.
(def ^:private ^Long ^:const datapoint-target-smooth 100)
(def ^:private ^Long ^:const datapoint-target-noisy  300)

(def ^:private ^Double ^:const noisiness-threshold 0.05)

(defn- target-size
  [series]
  (if (some-> series
              saddles
              (safe-divide (count series))
              (> noisiness-threshold))
    datapoint-target-noisy
    datapoint-target-smooth))

(defn- series->dataset
  ([fields series] (series->dataset identity fields series))
  ([keyfn fields series]
   {:rows    (for [[x y] (largest-triangle-three-buckets (target-size series)
                                                         series)]
               [(keyfn x) y])
    :columns (map :name fields)
    :cols    (map #(dissoc % :remapped_from) fields)}))

(defn- histogram->dataset
  ([field histogram] (histogram->dataset identity field histogram))
  ([keyfn field histogram]
   {:rows    (let [norm (safe-divide (h.impl/total-count histogram))]
               (for [[bin count] (nice-bins histogram)]
                 [(keyfn bin) (* count norm)]))
    :columns [(:name field) "SHARE"]
    :cols    [(dissoc field :remapped_from)
              {:name         "SHARE"
               :display_name "Share [%]"
               :description  "Share of corresponding bin in the overall population."
               :base_type    :type/Float}]}))

(defn- histogram-aggregated->dataset
  [field histogram]
  {:rows    (nice-bins histogram)
   :columns (map :name field)
   :cols    (map #(dissoc % :remapped_from) field)})

(def ^:private ^{:arglists '([field])} periodic-date-time?
  (comp #{:minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year
          :week-of-year :month-of-year :quarter-of-year}
        :unit))

(defn- field-type
  [field]
  (if (sequential? field)
    (mapv field-type field)
    [(cond
       (periodic-date-time? field)   :type/Integer
       (field/unix-timestamp? field) :type/DateTime
       :else                         (:base_type field))
     (or (:special_type field) :type/*)]))

(defmulti
  ^{:doc "Returns a transducer that extracts features from given coll.
          What features are extracted depends on the type of corresponding
          `Field`(s), amount of data points available (some algorithms have a
          minimum data points requirement) and `max-cost` setting.
          Note we are heavily using data sketches so some summary values may be
          approximate."
    :arglists '([opts field])}
  feature-extractor #(field-type %2))

(defmulti
  ^{:doc "Make features human-friendly."
    :arglists '([features])}
  x-ray :type)

(defmethod x-ray :default
  [{:keys [field] :as features}]
  (-> features
      (dissoc :has-nils? :all-distinct?)
      (u/update-when :histogram (partial histogram->dataset field))))

(defmulti
  ^{:doc "Feature vector for comparison/difference purposes."
    :arglists '([features])}
  comparison-vector :type)

(defmethod comparison-vector :default
  [features]
  (dissoc features :type :field :has-nils? :all-distinct? :percentiles :table :model))

(def ^:private Num      [:type/Number :type/*])
(def ^:private DateTime [:type/DateTime :type/*])
(def ^:private Category [:type/* :type/Category])
(def ^:private Text     [:type/Text :type/*])

(prefer-method feature-extractor Category Text)
(prefer-method feature-extractor Num Category)
(prefer-method x-ray Category Text)
(prefer-method x-ray Num Category)
(prefer-method comparison-vector Category Text)
(prefer-method comparison-vector Num Category)

(defn- histogram-extractor
  [{:keys [histogram]}]
  (let [nil-count   (h/nil-count histogram)
        total-count (h/total-count histogram)]
    {:histogram histogram
     :nil%      (safe-divide nil-count total-count)
     :has-nils? (pos? nil-count)
     :count     total-count
     :entropy   (h/entropy histogram)}))

(defn- cardinality-extractor
  [{:keys [cardinality histogram]}]
  (let [uniqueness (safe-divide cardinality (h/total-count histogram))]
    {:uniqueness    uniqueness
     :cardinality   cardinality
     :all-distinct? (some-> uniqueness (>= (- 1 cardinality-error)))}))

(defn- field-metadata-extractor
  [field]
  (fn [_]
    {:field field
     :model field
     :type  (field-type field)
     :table (field/table field)}))

(defmethod feature-extractor Num
  [{:keys [max-cost]} field]
  (redux/post-complete
   (redux/fuse
    (merge
     {:histogram   h/histogram
      :cardinality cardinality
      :kurtosis    stats/kurtosis
      :skewness    stats/skewness
      :zeros       ((filter (somef zero?)) stats/count)}
     (when (costs/full-scan? max-cost)
       {:sum            ((keep (somef double)) +)
        :sum-of-squares ((keep (somef #(Math/pow % 2))) +)})
     (when (isa? (:special_type field) :type/Category)
       {:histogram-categorical h/histogram-categorical})))
   (merge-juxt
    histogram-extractor
    cardinality-extractor
    (field-metadata-extractor field)
    (fn [{:keys [histogram histogram-categorical kurtosis skewness sum zeros
                 sum-of-squares] :as features}]
      (let [var             (h.impl/variance histogram)
            sd              (some-> var Math/sqrt)
            min             (h.impl/minimum histogram)
            max             (h.impl/maximum histogram)
            mean            (h.impl/mean histogram)
            median          (h.impl/median histogram)
            spread          (some-> max (- min))
            {:keys [q1 q3]} (h/iqr histogram)]
        {:positive-definite?    (some-> min (>= 0))
         :%>mean                (some->> mean ((h.impl/cdf histogram)) (- 1))
         :var>sd?               (some->> sd (> var))
         :0<=x<=1?              (when min (<= 0 min max 1))
         :-1<=x<=1?             (when min (<= -1 min max 1))
         :cv                    (some-> sd (safe-divide mean))
         :range-vs-sd           (some->> sd (safe-divide spread))
         :mean-median-spread    (some->> spread (safe-divide (- mean median)))
         :min-vs-max            (some->> max (safe-divide min))
         :range                 spread
         :min                   min
         :max                   max
         :mean                  mean
         :median                median
         :q1                    q1
         :q3                    q3
         :var                   var
         :sd                    sd
         :kurtosis              kurtosis
         :skewness              skewness
         :sum                   sum
         :sum-of-squares        sum-of-squares
         :zero%                 (safe-divide zeros (h/total-count histogram))
         :percentiles           (->> (range 0 1.1 0.1)
                                     (apply h.impl/percentiles histogram))
         :histogram-categorical histogram-categorical})))))

(defmethod comparison-vector Num
  [features]
  (select-keys features
               [:histogram :mean :median :min :max :sd :count :kurtosis :zero%
                :skewness :entropy :nil% :uniqueness :range :min-vs-max :q1
                :q3]))

(defmethod x-ray Num
  [{:keys [field histogram histogram-categorical] :as features}]
  (-> features
      (assoc :histogram (histogram->dataset field (or histogram-categorical
                                                      histogram)))
      (assoc :insights ((merge-juxt insights/normal-range
                                    insights/zeros
                                    insights/nils
                                    insights/multimodal
                                    insights/outliers)
                        features))
      (dissoc :has-nils? :var>sd? :0<=x<=1? :-1<=x<=1? :all-distinct?
              :positive-definite? :var>sd? :uniqueness :min-vs-max
              :histogram-categorical)))

(defn- last-n-days
  [n offset {:keys [breakout filter] :as query}]
  (let [[[_ datetime-field _]] breakout
        time-range             [:and
                                [:> datetime-field
                                 [:relative-datetime (- (+ n offset)) :day]]
                                [:<= datetime-field
                                 [:relative-datetime (- offset) :day]]]]
    (-> (values/query-values
         (db/select-one-field :db_id 'Table :id (:source_table query))
         (-> query
             (dissoc :breakout)
             (assoc :filter (if filter
                              [:and filter time-range]
                              time-range))))
        :rows
        ffirst)))

(defn- rolling-window-growth
  [window query]
  (math/growth (last-n-days window 0 query) (last-n-days window window query)))

(defn- infer-resolution
  [query series]
  (or (let [[head resolution] (-> query :breakout first ((juxt first last)))]
        (when (= head "datetime-field")
          (keyword resolution)))
      (let [deltas       (transduce (map (fn [[[a _] [b _]]]
                                           (- b a)))
                                    h/histogram
                                    (partition 2 1 series))
            median-delta (h.impl/median deltas)]
        (when (math/roughly= median-delta (h.impl/minimum deltas) 0.1)
          (condp math/roughly= median-delta
            (* 60 1000)                    :minute
            (* 60 60 1000)                 :hour
            (* 24 60 60 1000)              :day
            (* 7 24 60 60 1000)            :week
            (* (/ 365 12) 24 60 60 1000)   :month
            (* 3 (/ 365 12) 24 60 60 1000) :quarter
            (* 365 24 60 60 1000)          :year
            nil)))))

(defmethod feature-extractor [DateTime Num]
  [{:keys [max-cost query]} field]
  (redux/post-complete
   ((map (fn [[^java.util.Date x y]]
           [(some-> x .getTime double) y]))
    (redux/fuse {; y = a + b*x
                 :linear-regression     (stats/simple-linear-regression
                                         first second)
                 ; y = e^a * x^b
                 :power-law-regression  (stats/simple-linear-regression
                                         #(Math/log (first %))
                                         #(Math/log (second %)))
                 ; y = a + b*ln(x)
                 :log-linear-regression (stats/simple-linear-regression
                                         #(Math/log (first %)) second)
                 :series                conj}))
   (merge-juxt
    (field-metadata-extractor field)
    (fn [{:keys [series linear-regression power-law-regression
                 log-linear-regression] :as features}]
      (let [; We add a small regularization penalty to more complex curves to
            ; prevent technically correct but nonsense solutions.
            lambda     0.1
            regularize (fn [penalty]
                         (fn [ssr]
                           (if (Double/isNaN ssr)
                             Double/POSITIVE_INFINITY
                             (+ ssr (* lambda penalty)))))
            best-fit   (transduce
                        identity
                        (redux/post-complete
                         (redux/fuse
                          {:linear-regression
                           (let [[a b] linear-regression]
                             (redux/post-complete
                              (math/ssr (fn [x]
                                          (+ a (* b x))))
                              (regularize 0)))
                           :power-law-regression
                           (let [[a b] power-law-regression]
                             (redux/post-complete
                              (math/ssr (fn [x]
                                          (* (Math/exp a) (Math/pow x b))))
                              (regularize 2)))
                           :log-linear-regression
                           (let [[a b] log-linear-regression]
                             (redux/post-complete
                              (math/ssr (fn [x]
                                          (+ a (* b (Math/log x)))))
                              (regularize 1)))})
                         (fn [fits]
                           (let [[model score] (apply min-key val fits)]
                             (when-not (Double/isInfinite score)
                               {:model  model
                                :params (features model)}))))
                        series)
            resolution (infer-resolution query series)
            series     (if resolution
                         (ts/fill-timeseries resolution series)
                         series)]
        (merge {:resolution             resolution
                :series                 series
                :linear-regression      (when (not-any? #(Double/isInfinite %)
                                                        linear-regression)
                                          (zipmap [:offset :slope]
                                                  linear-regression))
                :best-fit               best-fit
                :growth-series          (when resolution
                                          (->> series
                                               (partition 2 1)
                                               (map (fn [[[_ y1] [x y2]]]
                                                      [x (or (math/growth y2 y1)
                                                             0)]))))
                :seasonal-decomposition
                (when (and resolution
                           (costs/unbounded-computation? max-cost))
                  (ts/decompose resolution series))
                :autocorrelation
                (math/autocorrelation {:max-lag (min (or (some-> resolution
                                                                 ts/period-length
                                                                 dec)
                                                         Long/MAX_VALUE)
                                                     (/ (count series) 2))}
                                      (map second series))}
               (when (and (costs/allow-joins? max-cost)
                          (:aggregation query))
                 {:YoY (rolling-window-growth 365 query)
                  :MoM (rolling-window-growth 30 query)
                  :WoW (rolling-window-growth 7 query)
                  :DoD (rolling-window-growth 1 query)})))))))

(defmethod comparison-vector [DateTime Num]
  [features]
  (-> features
      (dissoc :resolution :best-fit)
      ((get-method comparison-vector :default))))

(defn- unpack-linear-regression
  [keyfn x-field series {:keys [offset slope] :as model}]
  (when model
    (series->dataset keyfn
                     [x-field
                      {:name         "TREND"
                       :display_name "Linear regression trend"
                       :base_type    :type/Float}]
                                        ; 2 points fully define a line
                     (for [[x y] [(first series) (last series)]]
                       [x (+ (* slope x) offset)]))))

(defmethod x-ray [DateTime Num]
  [{:keys [field series] :as features}]
  (let [x-field (first field)]
    (-> features
        (update :series (partial series->dataset ts/from-double field))
        (dissoc :autocorrelation :best-fit)
        (assoc :insights ((merge-juxt insights/noisiness
                                      insights/variation-trend
                                      insights/autocorrelation
                                      insights/seasonality
                                      insights/structural-breaks
                                      insights/stationary
                                      insights/trend)
                          features))
        (update :growth-series (partial series->dataset ts/from-double
                                        [x-field
                                         {:name         "GROWTH"
                                          :display_name "Growth [%]"
                                          :base_type    :type/Float}]))
        (update :linear-regression
                (partial unpack-linear-regression ts/from-double x-field series))
        (update-in [:seasonal-decomposition :trend]
                   (partial series->dataset ts/from-double
                            [x-field
                             {:name         "TREND"
                              :display_name "Growth trend"
                              :base_type    :type/Float}]))
        (update-in [:seasonal-decomposition :seasonal]
                   (partial series->dataset ts/from-double
                            [x-field
                             {:name         "SEASONAL"
                              :display_name "Seasonal component"
                              :base_type    :type/Float}]))
        (update-in [:seasonal-decomposition :residual]
                   (partial series->dataset ts/from-double
                            [x-field
                             {:name         "RESIDUAL"
                              :display_name "Decomposition residual"
                              :base_type    :type/Float}])))))

(defmethod feature-extractor [Category Num]
  [{:keys [max-cost]} field]
  (redux/post-complete
   (redux/fuse {:histogram (h/map->histogram-categorical first second)})
   (merge-juxt
    (field-metadata-extractor field)
    histogram-extractor)))

(defmethod x-ray [Category Num]
  [{:keys [field histogram] :as features}]
  (-> features
      (update :histogram (partial histogram-aggregated->dataset field))))

(defmethod feature-extractor Text
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram ((map (somef (comp count u/jdbc-clob->str)))
                            h/histogram)})
   (merge-juxt
    (field-metadata-extractor field)
    histogram-extractor)))

(defmethod feature-extractor DateTime
  [_ {:keys [base_type unit] :as field}]
  (redux/post-complete
   (redux/fuse
    (merge
     {:histogram         ((map (somef (memfn ^java.util.Date getTime)))
                          h/histogram)
      :histogram-day     ((map (somef (memfn ^java.util.Date getDay)))
                          h/histogram-categorical)
      :histogram-month   ((map #(some->> ^java.util.Date % .getMonth inc))
                          h/histogram-categorical)
      :histogram-quarter ((map (somef ts/quarter)) h/histogram-categorical)}
     (when-not (or (isa? base_type :type/Date)
                   (#{:day :month :year :quarter :week} unit))
       {:histogram-hour ((map (somef (memfn ^java.util.Date getHours)))
                         h/histogram-categorical)})))
   (merge-juxt
    histogram-extractor
    (field-metadata-extractor field)
    (fn [{:keys [histogram] :as features}]
      (-> features
          (assoc :earliest (h.impl/minimum histogram)
                 :latest   (h.impl/maximum histogram)))))))

(defmethod x-ray DateTime
  [{:keys [field earliest latest histogram] :as features}]
  (-> features
      (update :earliest          ts/from-double)
      (update :latest            ts/from-double)
      (update :histogram         (partial histogram->dataset ts/from-double field))
      (update :percentiles       (partial m/map-vals ts/from-double))
      (update :histogram-hour    (somef
                                  (partial histogram->dataset
                                           {:name         "HOUR"
                                            :display_name "Hour of day"
                                            :base_type    :type/Integer
                                            :special_type :type/Category})))
      (update :histogram-day     (partial histogram->dataset
                                          {:name         "DAY"
                                           :display_name "Day of week"
                                           :base_type    :type/Integer
                                           :special_type :type/Category}))
      (update :histogram-month   (fn [histogram]
                                   (when-not (h/empty? histogram)
                                     (->> histogram
                                          (histogram->dataset
                                           {:name         "MONTH"
                                            :display_name "Month of year"
                                            :base_type    :type/Integer
                                            :special_type :type/Category})))))
      (update :histogram-quarter (fn [histogram]
                                   (when-not (h/empty? histogram)
                                     (->> histogram
                                          (histogram->dataset
                                           {:name         "QUARTER"
                                            :display_name "Quarter of year"
                                            :base_type    :type/Integer
                                            :special_type :type/Category})))))))

(defmethod feature-extractor Category
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram   h/histogram-categorical
                :cardinality cardinality})
   (merge-juxt
    histogram-extractor
    cardinality-extractor
    (field-metadata-extractor field))))

(defn field->features
  "Transduce given column with corresponding feature extractor."
  [opts field data]
  (transduce identity (feature-extractor opts field) data))

(defn dataset->features
  "Transuce each column in given dataset with corresponding feature extractor."
  [opts {:keys [rows cols]}]
  (transduce identity
             (redux/fuse
              (into {}
                (for [[i field] (m/indexed cols)
                      :when (not (or (:remapped_to field)
                                     (= :type/PK (:special_type field))))]
                  [(:name field) ((map #(nth % i))
                                  (feature-extractor opts field))])))
             rows))

(defmethod feature-extractor :default
  [opts field]
  (redux/post-complete
   (redux/fuse {:total-count stats/count
                :nil-count   ((filter nil?) stats/count)})
   (merge-juxt
    (field-metadata-extractor field)
    (fn [{:keys [total-count nil-count]}]
      {:count     total-count
       :nil%      (safe-divide nil-count total-count)
       :has-nils? (pos? nil-count)
       :type      nil}))))
