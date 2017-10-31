(ns metabase.feature-extraction.feature-extractors
  "Feature extractors for various models."
  (:require [bigml.histogram.core :as h.impl]
            [kixi.stats.core :as stats :refer [somef]]
            [medley.core :as m]
            [metabase.feature-extraction
             [costs :as costs]
             [histogram :as h]
             [insights :as insights]
             [math :as math]
             [timeseries :as ts]
             [values :as values]]
            [metabase.models.table :refer [Table]]
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
   {:rows    (let [norm (math/safe-divide (h.impl/total-count histogram))]
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
  (dissoc features :type :field :has-nils? :all-distinct? :percentiles :table :model))

(def ^:private Num      [:type/Number :type/*])
(def ^:private DateTime [:type/DateTime :type/*])
(def ^:private Category [:type/* :type/Category])
(def ^:private Any      [:type/* :type/*])
(def ^:private Text     [:type/Text :type/*])

(prefer-method feature-extractor Category Text)
(prefer-method feature-extractor Num Category)
(prefer-method feature-extractor [DateTime Num] [Any Num])
(prefer-method x-ray Category Text)
(prefer-method x-ray Num Category)
(prefer-method x-ray [DateTime Num] [Any Num])
(prefer-method comparison-vector Category Text)
(prefer-method comparison-vector Num Category)
(prefer-method comparison-vector [DateTime Num] [Any Num])

(defn- histogram-extractor
  [{:keys [histogram]}]
  (let [nil-count   (h/nil-count histogram)
        total-count (h/total-count histogram)]
    {:histogram histogram
     :nil%      (math/safe-divide nil-count total-count)
     :has-nils? (pos? nil-count)
     :count     total-count
     :entropy   (h/entropy histogram)}))

(defn- cardinality-extractor
  [{:keys [cardinality histogram]}]
  (let [uniqueness (math/safe-divide cardinality (h/total-count histogram))]
    {:uniqueness    uniqueness
     :cardinality   cardinality
     :all-distinct? (some-> uniqueness (>= (- 1 cardinality-error)))}))

(defn- field-metadata-extractor
  [field]
  (fn [_]
    {:field field
     :model field
     :type  (field-type field)
     :table (Table (:table_id field))}))

(defmethod feature-extractor Num
  [{:keys [max-cost]} field]
  (redux/post-complete
   (redux/fuse
    (merge
     {:histogram   h/histogram
      :cardinality cardinality
      :kurtosis    (redux/pre-step stats/kurtosis (somef double))
      :skewness    (redux/pre-step stats/skewness (somef double))
      :zeros       (redux/with-xform stats/count (filter (somef zero?)))}
     (when (costs/full-scan? max-cost)
       {:sum            (redux/with-xform + (keep (somef double)))
        :sum-of-squares (redux/with-xform + (keep (somef #(Math/pow % 2))))})
     (when (isa? (:special_type field) :type/Category)
       {:histogram-categorical h/histogram-categorical})))
   (merge-juxt
    histogram-extractor
    cardinality-extractor
    (field-metadata-extractor field)
    (fn [{:keys [histogram histogram-categorical kurtosis skewness sum zeros
                 sum-of-squares]}]
      (let [var             (h.impl/variance histogram)
            sd              (some-> var Math/sqrt)
            min             (h.impl/minimum histogram)
            max             (h.impl/maximum histogram)
            mean            (h.impl/mean histogram)
            median          (h.impl/median histogram)
            range           (some-> max (- min))
            {:keys [q1 q3]} (h/iqr histogram)]
        {:positive-definite? (some-> min (>= 0))
         :%>mean             (some->> mean ((h.impl/cdf histogram)) (- 1))
         :var>sd?            (some->> sd (> var))
         :0<=x<=1?           (when min (<= 0 min max 1))
         :-1<=x<=1?          (when min (<= -1 min max 1))
         :cv                 (some-> sd (math/safe-divide mean))
         :range-vs-sd        (some->> sd (math/safe-divide range))
         :mean-median-spread (some->> range (math/safe-divide (- mean median)))
         :min-vs-max         (some->> max (math/safe-divide min))
         :range              range
         :min                min
         :max                max
         :mean               mean
         :median             median
         :q1                 q1
         :q3                 q3
         :var                var
         :sd                 sd
         :kurtosis           kurtosis
         :skewness           skewness
         :sum                sum
         :sum-of-squares     sum-of-squares
         :zero%              (math/safe-divide zeros (h/total-count histogram))
         :percentiles        (apply h.impl/percentiles histogram (range 0 1 0.1))
         :histogram          (or histogram-categorical histogram)})))))

(defmethod comparison-vector Num
  [features]
  (select-keys features
               [:histogram :mean :median :min :max :sd :count :kurtosis :zero%
                :skewness :entropy :nil% :uniqueness :range :min-vs-max :q1
                :q3]))

(defmethod x-ray Num
  [{:keys [field] :as features}]
  (-> features
      (update :histogram (partial histogram->dataset field))
      (assoc :insights ((merge-juxt insights/normal-range
                                    insights/zeros
                                    insights/nils
                                    insights/multimodal)
                        features))
      (dissoc :has-nils? :var>sd? :0<=x<=1? :-1<=x<=1? :all-distinct?
              :positive-definite? :var>sd? :uniqueness :min-vs-max)))

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
   (redux/pre-step
    (redux/fuse {:linear-regression math/linear-regression
                 :series            conj})
    (fn [[^java.util.Date x y]]
      [(some-> x .getTime double) y]))
   (merge-juxt
    (field-metadata-extractor field)
    (fn [{:keys [series linear-regression]}]
      (let [resolution (infer-resolution query series)
            series     (if resolution
                         (ts/fill-timeseries resolution series)
                         series)]
        (merge {:resolution             resolution
                :series                 series
                :linear-regression      linear-regression
                :growth-series          (when resolution
                                          (->> series
                                               (partition 2 1)
                                               (map (fn [[[_ y1] [x y2]]]
                                                      [x (math/growth y2 y1)]))))
                :seasonal-decomposition
                (when (and resolution
                           (costs/unbounded-computation? max-cost))
                  (ts/decompose resolution series))
                :autocorrelation
                (math/autocorrelation {:max-lag (or (some-> resolution
                                                            ts/period-length
                                                            dec)
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
      (dissoc :resolution)
      ((get-method comparison-vector :default))))

(defn- unpack-linear-regression
  [keyfn x-field series {:keys [offset slope]}]
  (series->dataset keyfn
                   [x-field
                    {:name         "TREND"
                     :display_name "Linear regression trend"
                     :base_type    :type/Float}]
                   (for [[x _] series]
                     [x (+ (* slope x) offset)])))

(defmethod x-ray [DateTime Num]
  [{:keys [field series] :as features}]
  (let [x-field (first field)]
    (-> features
        (dissoc :series :autocorrelation)
        (assoc :insights ((merge-juxt insights/noisiness
                                      insights/variation-trend
                                      insights/autocorrelation
                                      insights/seasonality)
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

(defmethod feature-extractor [Any Num]
  [{:keys [max-cost]} field]
  (redux/post-complete
   (redux/fuse {:histogram (h/histogram-aggregated first second)})
   (merge-juxt
    (field-metadata-extractor field)
    histogram-extractor)))

(defmethod x-ray [Any Num]
  [{:keys [field histogram] :as features}]
  (-> features
      (update :histogram (partial histogram-aggregated->dataset field))))

(defmethod feature-extractor Text
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram (redux/pre-step
                            h/histogram
                            (somef (comp count u/jdbc-clob->str)))})
   (merge-juxt
    (field-metadata-extractor field)
    histogram-extractor)))

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
                                     (somef ts/quarter))}
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
                  [(:name field) (redux/pre-step (feature-extractor opts field)
                                                 #(nth % i))])))
             rows))

(defmethod feature-extractor :default
  [opts field]
  (redux/post-complete
   (redux/fuse {:total-count stats/count
                :nil-count   (redux/with-xform stats/count (filter nil?))})
   (merge-juxt
    (field-metadata-extractor field)
    (fn [{:keys [total-count nil-count]}]
      {:count     total-count
       :nil%      (math/safe-divide nil-count total-count)
       :has-nils? (pos? nil-count)
       :type      nil}))))
