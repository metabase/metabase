(ns metabase.feature-extraction.feature-extractors
  "Feature extractors for various models."
  (:require [bigml.histogram.core :as h.impl]
            [clj-time
             [coerce :as t.coerce]
             [core :as t]
             [periodic :as t.periodic]]
            [kixi.stats
             [core :as stats :refer [somef]]
             [math :as math]]
            [medley.core :as m]
            [metabase.feature-extraction
             [costs :as costs]
             [histogram :as h]
             [stl :as stl]
             [values :as values]]
            [metabase.query-processor.middleware.binning :as binning]
            [metabase
             [query-processor :as qp]
             [util :as u]]
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

(defn safe-divide
  "Like `clojure.core//`, but returns nil if denominator is 0."
  [x & denominators]
  (when (or (and (not-empty denominators) (not-any? zero? denominators))
            (and (not (zero? x)) (empty? denominators)))
    (apply / x denominators)))

(defn growth
  "Relative difference between `x1` an `x2`."
  [x2 x1]
  (when (and x1 x2 (not (zero? x1)))
    (let [x2 (double x2)
          x1 (double x1)]
      (cond
        (every? neg? [x1 x2])     (growth (- x1) (- x2))
        (and (neg? x1) (pos? x2)) (- (growth x1 x2))
        :else                     (/ (* (if (neg? x1) -1 1) (- x2 x1)) x1)))))

(defn- merge-juxt
  [& fns]
  (fn [x]
    (apply merge ((apply juxt fns) x))))

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

(defn- series->dataset
  ([fields series] (series->dataset identity fields series))
  ([keyfn fields series]
   {:rows    (for [[x y] series]
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
               :display_name "Share"
               :description  "Share of corresponding bin in the overall population."
               :base_type    :type/Float}]}))

(def ^:private Num      [:type/Number :type/*])
(def ^:private DateTime [:type/DateTime :type/*])
(def ^:private Category [:type/* :type/Category])
;(def ^:private Any      [:type/* :type/*])
(def ^:private Text     [:type/Text :type/*])

(defn- periodic-date-time?
  [field]
  (#{:minute-of-hour :hour-of-day :day-of-week :day-of-month :day-of-year
     :week-of-year :month-of-year :quarter-of-year} (:unit field)))

(defn- unix-timestamp?
  [{:keys [base_type special_type]}]
  (and (isa? base_type :type/Integer)
       (isa? special_type :type/DateTime)))

(defn- field-type
  [field]
  (if (sequential? field)
    (mapv field-type field)
    [(cond
       (periodic-date-time? field) :type/Integer
       (unix-timestamp? field)     :type/DateTime
       :else                       (:base_type field))
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
  (dissoc features :type :field :has-nils? :all-distinct? :percentiles))

(def ^:private percentiles (range 0 1 0.1))

(defn- histogram-extractor
  [{:keys [histogram]}]
  (let [nil-count   (h/nil-count histogram)
        total-count (h/total-count histogram)]
    (merge {:histogram histogram
            :nil%      (/ nil-count (max total-count 1))
            :has-nils? (pos? nil-count)
            :count     total-count
            :entropy   (h/entropy histogram)}
           (when-not (h/categorical? histogram)
             {:percentiles (apply h.impl/percentiles histogram percentiles)}))))

(defn- cardinality-extractor
  [{:keys [cardinality histogram]}]
  (let [uniqueness (/ cardinality (max (h/total-count histogram) 1))]
    {:uniqueness    uniqueness
     :cardinality   cardinality
     :all-distinct? (>= uniqueness (- 1 cardinality-error))}))

(defn- field-metadata-extractor
  [field]
  (fn [_]
    {:field field
     :type  (field-type field)}))

(defmethod feature-extractor Num
  [{:keys [max-cost]} field]
  (redux/post-complete
   (redux/fuse
    (merge
     {:histogram   h/histogram
      :cardinality cardinality}
     (when (costs/full-scan? max-cost)
       {:sum            (redux/with-xform + (keep (somef double)))
        :sum-of-squares (redux/with-xform +
                          (keep (somef (comp math/sq double))))})
     (when (costs/unbounded-computation? max-cost)
       {:kurtosis (redux/pre-step stats/kurtosis (somef double))
        :skewness (redux/pre-step stats/skewness (somef double))})
     (when (isa? (:special_type field) :type/Category)
       {:histogram-categorical h/histogram-categorical})))
   (merge-juxt
    histogram-extractor
    cardinality-extractor
    (field-metadata-extractor field)
    (fn [{:keys [histogram kurtosis skewness sum sum-of-squares
                 histogram-categorical]}]
      (let [var    (h.impl/variance histogram)
            sd     (some-> var math/sqrt)
            min    (h.impl/minimum histogram)
            max    (h.impl/maximum histogram)
            mean   (h.impl/mean histogram)
            median (h.impl/median histogram)
            range  (some-> max (- min))]
        {:positive-definite? (some-> min (>= 0))
         :%>mean             (some->> mean ((h.impl/cdf histogram)) (- 1))
         :var>sd?            (some->> sd (> var))
         :0<=x<=1?           (when min (<= 0 min max 1))
         :-1<=x<=1?          (when min (<= -1 min max 1))
         :cv                 (some-> sd (safe-divide mean))
         :range-vs-sd        (some->> sd (safe-divide range))
         :mean-median-spread (some->> range (safe-divide (- mean median)))
         :min-vs-max         (some->> max (safe-divide min))
         :range              range
         :min                min
         :max                max
         :mean               mean
         :median             median
         :var                var
         :sd                 sd
         :kurtosis           kurtosis
         :skewness           skewness
         :histogram          (or histogram-categorical histogram)
         :sum                sum
         :sum-of-squares     sum-of-squares})))))

(defmethod comparison-vector Num
  [features]
  (select-keys features
               [:histogram :mean :median :min :max :sd :count :kurtosis
                :skewness :entropy :nil% :uniqueness :range :min-vs-max]))

(defmethod x-ray Num
  [{:keys [field count] :as features}]
  (-> features
      (update :histogram (partial histogram->dataset field))
      (dissoc :has-nils? :var>sd? :0<=x<=1? :-1<=x<=1? :all-distinct?
              :positive-definite? :var>sd? :uniqueness :min-vs-max)))

(defmethod feature-extractor [Num Num]
  [_ field]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                 :correlation       (stats/correlation first second)
                 :covariance        (stats/covariance first second)})
    (partial map (somef double)))
   (merge-juxt
    (field-metadata-extractor field)
    identity)))

(def ^:private ^{:arglists '([t])} to-double
  "Coerce `DateTime` to `Double`."
  (comp double t.coerce/to-long))

(def ^:private ^{:arglists '([t])} from-double
  "Coerce `Double` into a `DateTime`."
  (somef (comp t.coerce/from-long long)))

(defn- fill-timeseries
  "Given a coll of `[DateTime, Any]` pairs evenly spaced `step` apart, fill
   missing points with 0."
  [step ts]
  (let [ts-index (into {} ts)]
    (into []
      (comp (map to-double)
            (take-while (partial >= (-> ts last first)))
            (map (fn [t]
                   [t (ts-index t 0)])))
      (some-> ts
              ffirst
              from-double
              (t.periodic/periodic-seq step)))))

(defn- decompose-timeseries
  "Decompose given timeseries with expected periodicty `period` into trend,
   seasonal component, and reminder.
   `period` can be one of `:hour`, `:day`, `:day-of-week`, `:week`, `:quarter`,
   `:day-of-month`, `:minute` or `:month`."
  [period ts]
  (when-let [period (case period
                      :hour         24
                      :minute       60
                      :day-of-week  7
                      :day-of-month 30
                      :month        12
                      :week         52
                      :quarter      4
                      :day          365
                      nil)]
    (when (>= (count ts) (* 2 period))
      (let [{:keys [trend seasonal residual xs]} (stl/decompose period ts)]
        {:trend    (map vector xs trend)
         :seasonal (map vector xs seasonal)
         :residual (map vector xs residual)}))))

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
  (growth (last-n-days window 0 query) (last-n-days window window query)))

(defn roughly=
  "Is `x` èqual to `y` within precision `precision` (default 0.05)."
  ([x y] (roughly= x y 0.05))
  ([x y precision]
   (<= (* (- 1 precision) x) y (* (+ 1 precision) x))))

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
        (when (roughly= median-delta (h.impl/minimum deltas) 0.1)
          (cond
            (roughly= median-delta (* 60 1000))                    :minute
            (roughly= median-delta (* 60 60 1000))                 :hour
            (roughly= median-delta (* 24 60 60 1000))              :day
            (roughly= median-delta (* 7 24 60 60 1000))            :week
            (roughly= median-delta (* (/ 365 12) 24 60 60 1000))   :month
            (roughly= median-delta (* 3 (/ 365 12) 24 60 60 1000)) :quarter
            (roughly= median-delta (* 365 24 60 60 1000))          :year
            :else                                                  nil)))))

(defmethod feature-extractor [DateTime Num]
  [{:keys [max-cost query]} field]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                 :series            conj})
    (fn [[^java.util.Date x y]]
      [(some-> x .getTime double) y]))
   (merge-juxt
    (field-metadata-extractor field)
    (fn [{:keys [series linear-regression]}]
      (let [resolution (infer-resolution query series)
            series     (if resolution
                         (fill-timeseries (case resolution
                                            :month   (t/months 1)
                                            :quarter (t/months 3)
                                            :year    (t/years 1)
                                            :week    (t/weeks 1)
                                            :day     (t/days 1)
                                            :hour    (t/hours 1)
                                            :minute  (t/minutes 1))
                                          series)
                         series)]
        (merge {:resolution             resolution
                :series                 series
                :linear-regression      linear-regression
                :growth-series          (when resolution
                                          (->> series
                                               (partition 2 1)
                                               (map (fn [[[_ y1] [x y2]]]
                                                      [x (growth y2 y1)]))))
                :seasonal-decomposition
                (when (and resolution
                           (costs/unbounded-computation? max-cost))
                  (decompose-timeseries resolution series))}
               (when (and (costs/allow-joins? max-cost)
                          (:aggregation query))
                 {:YoY (rolling-window-growth 365 query)
                  :MoM (rolling-window-growth 30 query)
                  :WoW (rolling-window-growth 7 query)
                  :DoD (rolling-window-growth 1 query)})))))))

(defmethod comparison-vector [DateTime Num]
  [features]
  (-> features
      (dissoc :resolution)
      ((get-method comparison-vector :default))))

(defn- unpack-linear-regression
  [keyfn x-field series [c k]]
  (series->dataset keyfn
                   [x-field
                    {:name         "TREND"
                     :display_name "Linear regression trend"
                     :base_type    :type/Float}]
                   (for [[x y] series]
                     [x (+ (* k x) c)])))

(defmethod x-ray [DateTime Num]
  [{:keys [field series] :as features}]
  (let [x-field (first field)]
    (-> features
        (dissoc :series)
        (update :growth-series (partial series->dataset from-double
                                        [x-field
                                         {:name         "GROWTH"
                                          :display_name "Growth"
                                          :base_type    :type/Float}]))
        (update :linear-regression
                (partial unpack-linear-regression from-double x-field series))
        (update-in [:seasonal-decomposition :trend]
                   (partial series->dataset from-double
                            [x-field
                             {:name         "TREND"
                              :display_name "Growth trend"
                              :base_type    :type/Float}]))
        (update-in [:seasonal-decomposition :seasonal]
                   (partial series->dataset from-double
                            [(first field)
                             {:name         "SEASONAL"
                              :display_name "Seasonal component"
                              :base_type    :type/Float}]))
        (update-in [:seasonal-decomposition :residual]
                   (partial series->dataset from-double
                            [(first field)
                             {:name         "RESIDUAL"
                              :display_name "Decomposition residual"
                              :base_type    :type/Float}])))))

;; (defmethod feature-extractor [Category Any]
;;   [opts [x y]]
;;   (rollup (redux/pre-step (feature-extractor opts y) second) first))

(defmethod feature-extractor Text
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram (redux/pre-step
                            h/histogram
                            (somef (comp count u/jdbc-clob->str)))})
   (merge-juxt
    (field-metadata-extractor field)
    histogram-extractor)))

(defprotocol Quarter
  "Quarter-of-year functionality"
  (quarter [dt] "Return which quarter (1-4) given date-like object falls into."))

(extend-type java.util.Date
  Quarter
  (quarter [dt]
    (-> dt .getMonth inc (* 0.33) Math/ceil long)))

(extend-type org.joda.time.DateTime
  Quarter
  (quarter [dt]
    (-> dt t/month (* 0.33) Math/ceil long)))

(defmethod feature-extractor DateTime
  [_ {:keys [base_type unit] :as field}]
  (redux/post-complete
   (redux/fuse (merge
                {:histogram         (redux/pre-step
                                     h/histogram
                                     (somef (memfn ^java.util.Date getTime)))
                 :histogram-day     (redux/pre-step
                                     h/histogram-categorical
                                     (somef (memfn ^java.util.Date getDay)))
                 :histogram-month   (redux/pre-step
                                     h/histogram-categorical
                                     #(when %
                                        (inc (.getMonth ^java.util.Date %))))
                 :histogram-quarter (redux/pre-step
                                     h/histogram-categorical
                                     (somef quarter))}
                (when-not (or (isa? base_type :type/Date)
                              (#{:day :month :year :quarter :week} unit))
                  {:histogram-hour (redux/pre-step
                                    h/histogram-categorical
                                    (somef (memfn ^java.util.Date getHours)))})))
   (merge-juxt
    histogram-extractor
    (field-metadata-extractor field)
    (fn [{:keys [histogram] :as features}]
      (-> features
          (assoc :earliest (h.impl/minimum histogram)
                 :latest   (h.impl/maximum histogram)))))))

(defn- round-to-month
  [dt]
  (t/floor dt t/month))

(defn month-frequencies
  "Month frequencies in the interval `earliest` to `latest`."
  [earliest latest]
  (->> (t.periodic/periodic-seq (round-to-month earliest) (t/months 1))
       (take-while (complement (partial t/before? latest)))
       (map t/month)
       frequencies))

(defn quarter-frequencies
  "Quarter frequencies in the interval `earliest` to `latest`."
  [earliest latest]
  (->> (t.periodic/periodic-seq (round-to-month earliest) (t/months 1))
       (take-while (complement (partial t/before? latest)))
       (m/distinct-by (juxt t/year quarter))
       (map quarter)
       frequencies))

(defn normalize-overrepresented
  "Normalize `:rows` in `dataset` as if all keys occured with the same frequency."
  [freqs dataset]
  (let [baseline (apply min (vals freqs))]
    (update dataset :rows (partial map (fn [[k v]]
                                         [k (/ (* v baseline) (freqs k))])))))

(defmethod x-ray DateTime
  [{:keys [field earliest latest histogram] :as features}]
  (let [earliest (from-double earliest)
        latest   (from-double latest)]
    (-> features
        (assoc  :earliest          earliest)
        (assoc  :latest            latest)
        (update :histogram         (partial histogram->dataset from-double field))
        (update :percentiles       (partial m/map-vals from-double))
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
        (update :histogram-month   (partial histogram->dataset
                                    {:name         "MONTH"
                                     :display_name "Month of year"
                                     :base_type    :type/Integer
                                     :special_type :type/Category}))
        (update :histogram-quarter (partial histogram->dataset
                                            {:name         "QUARTER"
                                             :display_name "Quarter of year"
                                             :base_type    :type/Integer
                                             :special_type :type/Category})))))

(defmethod feature-extractor Category
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram   h/histogram-categorical
                :cardinality cardinality})
   (merge-juxt
    histogram-extractor
    cardinality-extractor
    (field-metadata-extractor field))))

(defmethod feature-extractor :default
  [_ field]
  (redux/post-complete
   (redux/fuse {:total-count stats/count
                :nil-count   (redux/with-xform stats/count (filter nil?))})
   (merge-juxt
    (field-metadata-extractor field)
    (fn [{:keys [total-count nil-count]}]
      {:count     total-count
       :nil%      (/ nil-count (max total-count 1))
       :has-nils? (pos? nil-count)
       :type      [nil (field-type field)]}))))

(prefer-method feature-extractor Category Text)
(prefer-method feature-extractor Num Category)
(prefer-method x-ray Category Text)
(prefer-method x-ray Num Category)
(prefer-method comparison-vector Category Text)
(prefer-method comparison-vector Num Category)
