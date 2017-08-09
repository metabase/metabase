(ns metabase.fingerprinting.fingerprinters
  "Fingerprinting (feature extraction) for various models."
  (:require [bigml.histogram.core :as h.impl]
            [clojure.math.numeric-tower :refer [ceil expt floor round]] ;;;;;; temp!
            [clj-time
             [coerce :as t.coerce]
             [core :as t]
             [format :as t.format]
             [periodic :as t.periodic]]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [medley.core :as m]
            [metabase.fingerprinting
             [histogram :as h]
             [costs :as costs]
             [stl :as stl]]
            [metabase.util :as u]            ;;;; temp!
            [redux.core :as redux])
  (:import com.clearspring.analytics.stream.cardinality.HyperLogLogPlus))

(def ^:private ^:const percentiles (range 0 1 0.1))

(defn rollup
  "Transducer that groups by `groupfn` and reduces each group with `f`.
   Note the contructor airity of `f` needs to be free of side effects."
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
  (when (every? some? [x2 x1])
    (safe-divide (* (if (neg? x1) -1 1) (- x2 x1)) x1)))

(def ^:private ^:const ^Double cardinality-error 0.01)

(defn cardinality
  "Transducer that sketches cardinality using HyperLogLog++.
   https://research.google.com/pubs/pub40671.html"
  ([] (HyperLogLogPlus. 14 25))
  ([^HyperLogLogPlus acc] (.cardinality acc))
  ([^HyperLogLogPlus acc x]
   (.offer acc x)
   acc))

(def ^:private Num      [:type/Number :type/*])
(def ^:private DateTime [:type/DateTime :type/*])
(def ^:private Category [:type/* :type/Category])
; (def ^:private Any      [:type/* :type/*])
(def ^:private Text     [:type/Text :type/*])

;;;;;;;;;;;;;;;;;; temporary cp until we merge the binning branch ;;;;;;;;;;


(defn- calculate-bin-width [min-value max-value num-bins]
  (u/round-to-decimals 5 (/ (- max-value min-value)
                            num-bins)))

(defn- calculate-num-bins [min-value max-value bin-width]
  (long (ceil (/ (- max-value min-value)
                         bin-width))))

(defn- ceil-to
  [precision x]
  (let [scale (/ precision)]
    (/ (ceil (* x scale)) scale)))

(defn- floor-to
  [precision x]
  (let [scale (/ precision)]
    (/ (floor (* x scale)) scale)))

;;;;;;;; cast to long
(defn order-of-magnitude
  "Return oder of magnitude."
  [x]
  (if (zero? x)
    0
    (long (floor (/ (math/log (math/abs x)) (math/log 10))))))

(def ^:private ^:const pleasing-numbers [1 1.25 2 2.5 3 5 7.5 10])

(defn- nicer-bin-width
  [min-value max-value num-bins]
  (let [min-bin-width (calculate-bin-width min-value max-value num-bins)
        scale         (expt 10 (order-of-magnitude min-bin-width))]
    (->> pleasing-numbers
         (map (partial * scale))
         (drop-while (partial > min-bin-width))
         first)))

(defn- nicer-bounds
  [min-value max-value bin-width]
  [(floor-to bin-width min-value) (ceil-to bin-width max-value)])

(def ^:private ^:const max-steps 10)

(defn- fixed-point
  [f]
  (fn [x]
    (->> (iterate f x)
         (partition 2 1)
         (take max-steps)
         (drop-while (partial apply not=))
         ffirst)))

(def ^:private ^{:arglists '([binned-field])} nicer-breakout
  (fixed-point
   (fn
     [{:keys [min-value max-value bin-width num-bins strategy] :as binned-field}]
     (let [bin-width (if (= strategy :num-bins)
                       (nicer-bin-width min-value max-value num-bins)
                       bin-width)
           [min-value max-value] (nicer-bounds min-value max-value bin-width)]
       (-> binned-field
           (assoc :min-value min-value
                  :max-value max-value
                  :num-bins  (if (= strategy :num-bins)
                               num-bins
                               (calculate-num-bins min-value max-value bin-width))
                  :bin-width bin-width))))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- equidistant-bins
  [histogram]
  (if (h/categorical? histogram)
    (-> histogram h.impl/bins first :target :counts)
    (let [{:keys [min max]} (h.impl/bounds histogram)]
      (cond
        (nil? min)  []
        (= min max) [[min 1.0]]
        :else       (let [{:keys [min-value num-bins bin-width]}
                          (nicer-breakout
                           {:min-value min
                            :max-value max
                            :num-bins  (->> histogram
                                            h/optimal-bin-width
                                            (calculate-num-bins min max))
                            :strategy  :num-bins})]
                      (->> min-value
                           (iterate (partial + bin-width))
                           (take (inc num-bins))
                           (map (fn [x]
                                  [x (h.impl/sum histogram x)]))
                           (partition 2 1)
                           (map (fn [[[x s1] [_ s2]]]
                                  [x (- s2 s1)]))))))))

(defn- histogram->dataset
  ([field histogram] (histogram->dataset identity field histogram))
  ([keyfn field histogram]
   {:rows    (let [norm (safe-divide (h.impl/total-count histogram))]
               (for [[k v] (equidistant-bins histogram)]
                 [(keyfn k) (* v norm)]))
    :columns [(:name field) "SHARE"]
    :cols [(dissoc field :remapped_from)
           {:name         "SHARE"
            :display_name "Share"
            :description  "Share of corresponding bin in the overall population."
            :base_type    :type/Float}]}))

(defn- field-type
  [field]
  (if (sequential? field)
    (mapv field-type field)
    [(:base_type field) (or (:special_type field) :type/*)]))

(defmulti
  ^{:doc "Transducer that summarizes (_fingerprints_) given coll. What features
          are extracted depends on the type of corresponding `Field`(s), amount
          of data points available (some algorithms have a minimum data points
          requirement) and `max-cost.computation` setting.
          Note we are heavily using data sketches so some summary values may be
          approximate."
    :arglists '([opts field])}
  fingerprinter #(field-type %2))

(defmulti
  ^{:doc "Make fingerprint human readable."
    :arglists '([fingerprint])}
  x-ray :type)

(defmethod x-ray :default
  [fingerprint]
  fingerprint)

(defmulti
  ^{:doc "Fingerprint feature vector for comparison/difference purposes."
    :arglists '([fingerprint])}
  comparison-vector :type)

(defmethod comparison-vector :default
  [fingerprint]
  (dissoc fingerprint :type :field :has-nils?))

(defmethod fingerprinter Num
  [{:keys [max-cost]} field]
  (redux/post-complete
   (redux/fuse {:histogram      h/histogram
                :cardinality    cardinality
                :kurtosis       stats/kurtosis
                :skewness       stats/skewness
                :sum            (redux/with-xform + (remove nil?))
                :sum-of-squares (redux/with-xform + (comp (remove nil?)
                                                          (map math/sq)))})
   (fn [{:keys [histogram cardinality kurtosis skewness sum sum-of-squares]}]
     (if (pos? (h/total-count histogram))
       (let [nil-count   (h/nil-count histogram)
             total-count (h/total-count histogram)
             uniqueness  (/ cardinality (max total-count 1))
             var         (or (h.impl/variance histogram) 0)
             sd          (math/sqrt var)
             min         (h.impl/minimum histogram)
             max         (h.impl/maximum histogram)
             mean        (h.impl/mean histogram)
             median      (h.impl/median histogram)
             range       (- max min)]
         (merge
          {:histogram          histogram
           :percentiles        (apply h.impl/percentiles histogram percentiles)
           :positive-definite? (>= min 0)
           :%>mean             (- 1 ((h.impl/cdf histogram) mean))
           :uniqueness         uniqueness
           :var>sd?            (> var sd)
           :nil%               (/ nil-count (clojure.core/max total-count 1))
           :has-nils?          (pos? nil-count)
           :0<=x<=1?           (<= 0 min max 1)
           :-1<=x<=1?          (<= -1 min max 1)
           :cv                 (safe-divide sd mean)
           :range-vs-sd        (safe-divide sd range)
           :mean-median-spread (safe-divide (- mean median) range)
           :min-vs-max         (safe-divide min max)
           :range              range
           :cardinality        cardinality
           :min                min
           :max                max
           :mean               mean
           :median             median
           :var                var
           :sd                 sd
           :count              total-count
           :kurtosis           kurtosis
           :skewness           skewness
           :all-distinct?      (>= uniqueness (- 1 cardinality-error))
           :entropy            (h/entropy histogram)
           :type               Num
           :field              field}
          (when (costs/full-scan? max-cost)
            {:sum            sum
             :sum-of-squares sum-of-squares})))
       {:count 0
        :type  Num
        :field field}))))

(defmethod comparison-vector Num
  [fingerprint]
  (select-keys fingerprint
               [:histogram :mean :median :min :max :sd :count :kurtosis
                :skewness :entropy :nil% :uniqueness :range :min-vs-max]))

(defmethod x-ray Num
  [{:keys [field count] :as fingerprint}]
  (if (pos? count)
    (-> fingerprint
        (update :histogram (partial histogram->dataset field))
        (dissoc :has-nils? :var>sd? :0<=x<=1? :-1<=x<=1? :all-distinct?
                :positive-definite? :var>sd? :uniqueness :min-vs-max))
    fingerprint))

(defmethod fingerprinter [Num Num]
  [_ field]
  (redux/post-complete
   (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                :correlation       (stats/correlation first second)
                :covariance        (stats/covariance first second)})
   #(assoc % :type [Num Num]
           :field field)))

(def ^:private ^{:arglists '([t])} to-double
  "Coerce `DateTime` to `Double`."
  (comp double t.coerce/to-long))

(def ^:private ^{:arglists '([t])} from-double
  "Coerce `Double` into a `DateTime`."
  (comp t.coerce/from-long long))

(defn- fill-timeseries
  "Given a coll of `[DateTime, Any]` pairs with periodicty `step` fill missing
   periods with 0."
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
   `period` can be one of `:day`, `week`, or `:month`."
  [period ts]
  (let [period (case period
                 :month 12
                 :week  52
                 :day   365)]
    (when (>= (count ts) (* 2 period))
      (select-keys (stl/decompose period ts) [:trend :seasonal :residual]))))

(defmethod fingerprinter [DateTime Num]
  [{:keys [max-cost resolution query]} field]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                 :series            (if (nil? resolution)
                                      conj
                                      (redux/post-complete
                                       conj
                                       (partial fill-timeseries
                                                (case resolution
                                                  :month (t/months 1)
                                                  :week  (t/weeks 1)
                                                  :day   (t/days 1)))))})
    (fn [[x y]]
      [(-> x t.format/parse to-double) y]))
   (fn [{:keys [series linear-regression]}]
     (let [ys-r (->> series (map second) reverse not-empty)]
       (merge {:resolution             resolution
               :type                   [DateTime Num]
               :field                  field
               :series                 series
               :linear-regression      linear-regression
               :seasonal-decomposition
               (when (and resolution
                          (costs/unbounded-computation? max-cost))
                 (decompose-timeseries resolution series))}
              (when (costs/alow-joins? series)
                {:YoY 0
                 :MoM 0
                 :WoW 0
                 :DoD 0}))))))

(defmethod comparison-vector [DateTime Num]
  [fingerprint]
  (dissoc fingerprint :type :resolution :field))

(defmethod x-ray [DateTime Num]
  [fingerprint]
  (dissoc fingerprint :series))

;; This one needs way more thinking
;;
;; (defmethod fingerprinter [Category Any]
;;   [opts [x y]]
;;   (rollup (redux/pre-step (fingerprinter opts y) second) first))

(defmethod fingerprinter Text
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram (redux/pre-step
                            h/histogram
                            (stats/somef (comp count u/jdbc-clob->str)))})
   (fn [{:keys [histogram]}]
     (let [nil-count   (h/nil-count histogram)
           total-count (h/total-count histogram)]
       {:min        (h.impl/minimum histogram)
        :max        (h.impl/maximum histogram)
        :histogram  histogram
        :count      total-count
        :nil%       (/ nil-count (max total-count 1))
        :has-nils?  (pos? nil-count)
        :type       Text
        :field      field}))))

(defmethod x-ray Text
  [{:keys [field] :as fingerprint}]
  (update fingerprint :histogram (partial histogram->dataset field)))

(defn- quarter
  [dt]
  (-> dt t/month (/ 3) Math/ceil long))

(defmethod fingerprinter DateTime
  [_ field]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:histogram         (redux/pre-step h/histogram t.coerce/to-long)
                 :histogram-hour    (redux/pre-step h/histogram-categorical
                                                    (stats/somef t/hour))
                 :histogram-day     (redux/pre-step h/histogram-categorical
                                                    (stats/somef t/day-of-week))
                 :histogram-month   (redux/pre-step h/histogram-categorical
                                                    (stats/somef t/month))
                 :histogram-quarter (redux/pre-step h/histogram-categorical
                                                    (stats/somef quarter))})
    t.format/parse)
   (fn [{:keys [histogram histogram-hour histogram-day histogram-month
                histogram-quarter]}]
     (let [nil-count   (h/nil-count histogram)
           total-count (h/total-count histogram)]
       {:earliest          (h.impl/minimum histogram)
        :latest            (h.impl/maximum histogram)
        :histogram         histogram
        :percentiles       (apply h.impl/percentiles histogram percentiles)
        :histogram-hour    histogram-hour
        :histogram-day     histogram-day
        :histogram-month   histogram-month
        :histogram-quarter histogram-quarter
        :count             total-count
        :nil%              (/ nil-count (max total-count 1))
        :has-nils?         (pos? nil-count)
        :entropy           (h/entropy histogram)
        :type              DateTime
        :field             field}))))

(defmethod comparison-vector DateTime
  [fingerprint]
  (dissoc fingerprint :type :percentiles :field :has-nils?))

(defn- round-to-month
  [dt]
  (if (<= (t/day dt) 15)
    (t/floor dt t/month)
    (t/date-time (t/year dt) (inc (t/month dt)))))

(defn- month-frequencies
  [earliest latest]
  (let [earilest    (round-to-month latest)
        latest      (round-to-month latest)
        start-month (t/month earliest)
        duration    (t/in-months (t/interval earliest latest))]
    (->> (range (dec start-month) (+ start-month duration))
         (map #(inc (mod % 12)))
         frequencies)))

(defn- quarter-frequencies
  [earliest latest]
  (let [earilest      (round-to-month latest)
        latest        (round-to-month latest)
        start-quarter (quarter earliest)
        duration      (round (/ (t/in-months (t/interval earliest latest)) 3))]
    (->> (range (dec start-quarter) (+ start-quarter duration))
         (map #(inc (mod % 4)))
         frequencies)))

(defn- weigh-periodicity
  [weights card]
  (let [baseline (apply min (vals weights))]
    (update card :rows (partial map (fn [[k v]]
                                      [k (* v (/ baseline (weights k)))])))))

(defmethod x-ray DateTime
  [{:keys [field earliest latest count] :as fingerprint}]
  (if (pos? count)
    (let [earliest (from-double earliest)
          latest   (from-double latest)]
      (-> fingerprint
          (assoc  :earliest          earliest)
          (assoc  :latest            latest)
          (update :histogram         (partial histogram->dataset from-double field))
          (update :percentiles       (partial m/map-vals from-double))
          (update :histogram-hour    (partial histogram->dataset
                                              {:name         "HOUR"
                                               :display_name "Hour of day"
                                               :base_type    :type/Integer
                                               :special_type :type/Category}))
          (update :histogram-day     (partial histogram->dataset
                                              {:name         "DAY"
                                               :display_name "Day of week"
                                               :base_type    :type/Integer
                                               :special_type :type/Category}))
          (update :histogram-month   (comp
                                      (partial weigh-periodicity
                                               (month-frequencies earliest latest))
                                      (partial histogram->dataset
                                               {:name         "MONTH"
                                                :display_name "Month of year"
                                                :base_type    :type/Integer
                                                :special_type :type/Category})))
          (update :histogram-quarter (comp
                                      (partial weigh-periodicity
                                               (quarter-frequencies earliest latest))
                                      (partial histogram->dataset
                                               {:name         "QUARTER"
                                                :display_name "Quarter of year"
                                                :base_type    :type/Integer
                                                :special_type :type/Category})))))
    (select-keys fingerprint [:count :type :field])))

(defmethod fingerprinter Category
  [_ field]
  (redux/post-complete
   (redux/fuse {:histogram   h/histogram-categorical
                :cardinality cardinality})
   (fn [{:keys [histogram cardinality]}]
     (let [nil-count   (h/nil-count histogram)
           total-count (h/total-count histogram)
           uniqueness  (/ cardinality (max total-count 1))]
       {:histogram   histogram
        :uniqueness  uniqueness
        :nil%        (/ nil-count (max total-count 1))
        :has-nils?   (pos? nil-count)
        :cardinality cardinality
        :count       total-count
        :entropy     (h/entropy histogram)
        :type        Category
        :field       field}))))

(defmethod comparison-vector Category
  [fingerprint]
  (dissoc fingerprint :type :cardinality :field :has-nils?))

(defmethod x-ray Category
  [{:keys [field] :as fingerprint}]
  (update fingerprint :histogram (partial histogram->dataset field)))

(defmethod fingerprinter :default
  [_ field]
  (redux/post-complete
   (redux/fuse {:total-count stats/count
                :nil-count   (redux/with-xform stats/count (filter nil?))})
   (fn [{:keys [total-count nil-count]}]
     {:count     total-count
      :nil%      (/ nil-count (max total-count 1))
      :has-nils? (pos? nil-count)
      :type      [nil (field-type field)]
      :field     field})))

(prefer-method fingerprinter Category Text)
(prefer-method fingerprinter Num Category)
