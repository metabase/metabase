(ns metabase.fingerprinting.fingerprinters
  "Fingerprinting (feature extraction) for various models."
  (:require [bigml.histogram.core :as h.impl]
            [bigml.sketchy.hyper-loglog :as hyper-loglog]
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
             [costs :as costs]]
            [metabase.models
             [metric :refer [Metric]]]
            [redux.core :as redux]
            [tide.core :as tide]))

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
  [numerator & denominators]
  (when (or (and (not-empty denominators) (not-any? zero? denominators))
            (and (not (zero? numerator)) (empty? denominators)))
    (apply / numerator denominators)))

(defn growth
  "Relative difference between `x1` an `x2`."
  [x2 x1]
  (when (every? some? [x2 x1])
    (safe-divide (* (if (neg? x1) -1 1) (- x2 x1)) x1)))

(def ^:private ^:const ^Double cardinality-error 0.01)

(defn cardinality
  "Transducer that sketches cardinality using Hyper-LogLog."
  ([] (hyper-loglog/create cardinality-error))
  ([acc] (hyper-loglog/distinct-count acc))
  ([acc x] (hyper-loglog/insert acc x)))

(def Num      [:type/Number :type/*])
(def DateTime [:type/DateTime :type/*])
(def Category [:type/* :type/Category])
(def Any      [:type/* :type/*])
(def Text     [:type/Text :type/*])

(defn field-type
  [field]
  (cond
    (sequential? field)             (mapv field-type field)
    (instance? (type Metric) field) Num
    :else                           [(:base_type field)
                                     (or (:special_type field) :type/*)]))

(defmulti fingerprinter
  "Transducer that summarizes (_fingerprints_) given coll. What features are
   extracted depends on the type of corresponding `Field`(s), amount of data
   points available (some algorithms have a minimum data points requirement)
   and `max-cost.computation` setting.
   Note we are heavily using data sketches so some summary values may be
   approximate."
  #(field-type %2))

(defmulti prettify
  "Make fingerprint human readable."
  :type)

(defmethod prettify :default
  [fingerprint]
  fingerprint)

(defmulti comparison-vector
  "Fingerprint feature vector for comparison/difference purposes."
  :type)

(defmethod comparison-vector :default
  [fingerprint]
  (dissoc fingerprint :type :field :has-nils?))

(defmethod fingerprinter Num
  [_ _]
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
             unique%     (/ cardinality (max total-count 1))
             var         (or (h.impl/variance histogram) 0)
             sd          (math/sqrt var)
             min         (h.impl/minimum histogram)
             max         (h.impl/maximum histogram)
             mean        (h.impl/mean histogram)
             median      (h.impl/median histogram)
             span        (- max min)]
         {:histogram            histogram
          :percentiles          (apply h.impl/percentiles histogram percentiles)
          :sum                  sum
          :sum-of-squares       sum-of-squares
          :positive-definite?   (>= min 0)
          :%>mean               (- 1 ((h.impl/cdf histogram) mean))
          :cardinality-vs-count unique%
          :var>sd?              (> var sd)
          :nil%                 (/ nil-count (clojure.core/max total-count 1))
          :has-nils?            (pos? nil-count)
          :0<=x<=1?             (<= 0 min max 1)
          :-1<=x<=1?            (<= -1 min max 1)
          :cv                   (safe-divide mean sd)
          :span-vs-sd           (safe-divide span sd)
          :mean-median-spread   (safe-divide span (- mean median))
          :min-vs-max           (safe-divide min max)
          :span                 span
          :cardinality          cardinality
          :min                  min
          :max                  max
          :mean                 mean
          :median               median
          :var                  var
          :sd                   sd
          :count                total-count
          :kurtosis             kurtosis
          :skewness             skewness
          :all-distinct?        (>= unique% (- 1 cardinality-error))
          :entropy              (h/entropy histogram)
          :type                 Num})
       {:count 0
        :type  Num}))))

(defmethod comparison-vector Num
  [fingerprint]
  (select-keys fingerprint
               [:histogram :mean :median :min :max :sd :count :kurtosis
                :skewness :entropy :nil% :cardinality-vs-count :span]))

(defmethod prettify Num
  [fingerprint]
  (update fingerprint :histogram h/pdf))

(defmethod fingerprinter [Num Num]
  [_ _]
  (redux/post-complete
   (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                :correlation       (stats/correlation first second)
                :covariance        (stats/covariance first second)})
   #(assoc % :type [Num Num])))

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
      (select-keys (tide/decompose period ts) [:trend :seasonal :reminder]))))

(defmethod fingerprinter [DateTime Num]
  [{:keys [max-cost scale]} _]
  (let [scale (or scale :raw)]
    (redux/post-complete
     (redux/pre-step
      (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                   :series            (if (= scale :raw)
                                        conj
                                        (redux/post-complete
                                         conj
                                         (partial fill-timeseries
                                                  (case scale
                                                    :month (t/months 1)
                                                    :week  (t/weeks 1)
                                                    :day   (t/days 1)))))})
      (fn [[x y]]
        [(-> x t.format/parse to-double) y]))
     (fn [{:keys [series linear-regression]}]
       (let [ys-r (->> series (map second) reverse not-empty)]
         (merge {:scale                  scale
                 :type                   [DateTime Num]
                 :series                 series
                 :linear-regression      linear-regression
                 :seasonal-decomposition
                 (when (and (not= scale :raw)
                            (costs/unbounded-computation? max-cost))
                   (decompose-timeseries scale series))}
                (case scale
                  :month {:YoY          (growth (first ys-r) (nth ys-r 11))
                          :YoY-previous (growth (second ys-r) (nth ys-r 12))
                          :MoM          (growth (first ys-r) (second ys-r))
                          :MoM-previous (growth (second ys-r) (nth ys-r 2))}
                  :week  {:YoY          (growth (first ys-r) (nth ys-r 51))
                          :YoY-previous (growth (second ys-r) (nth ys-r 52))
                          :WoW          (growth (first ys-r) (second ys-r))
                          :WoW-previous (growth (second ys-r) (nth ys-r 2))}
                  :day   {:DoD          (growth (first ys-r) (second ys-r))
                          :DoD-previous (growth (second ys-r) (nth ys-r 2))}
                  :raw   nil)))))))

(defmethod comparison-vector [DateTime Num]
  [fingerprint]
  (dissoc fingerprint :type :scale :field))

(defmethod prettify [DateTime Num]
  [fingerprint]
  (update fingerprint :series #(for [[x y] %]
                                 [(from-double x) y])))

;; This one needs way more thinking
;;
;; (defmethod fingerprinter [Category Any]
;;   [opts [x y]]
;;   (rollup (redux/pre-step (fingerprinter opts y) second) first))

(defmethod fingerprinter Text
  [_ _]
  (redux/post-complete
   (redux/fuse {:histogram (redux/pre-step h/histogram (stats/somef count))})
   (fn [{:keys [histogram]}]
     (let [nil-count   (h/nil-count histogram)
           total-count (h/total-count histogram)]
       {:min        (h.impl/minimum histogram)
        :max        (h.impl/maximum histogram)
        :histogram  histogram
        :count      total-count
        :nil%       (/ nil-count (max total-count 1))
        :has-nils?  (pos? nil-count)
        :type       Text}))))

(defmethod prettify Text
  [fingerprint]
  (update fingerprint :histogram h/pdf))

(defn- quarter
  [dt]
  (-> (t/month dt) (/ 3) Math/ceil long))

(defmethod fingerprinter DateTime
  [_ _]
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
       {:min               (h.impl/minimum histogram)
        :max               (h.impl/maximum histogram)
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
        :type              DateTime}))))

(defmethod comparison-vector DateTime
  [fingerprint]
  (dissoc fingerprint :type :percentiles :field :has-nils?))

(defmethod prettify DateTime
  [fingerprint]
  (-> fingerprint
      (update :min               from-double)
      (update :max               from-double)
      (update :histogram         (comp (partial map (fn [[k v]]
                                                      [(from-double k) v]))
                                       h/pdf))
      (update :percentiles       (partial m/map-vals from-double))
      (update :histogram-hour    h/pdf)
      (update :histogram-day     h/pdf)
      (update :histogram-month   h/pdf)
      (update :histogram-quarter h/pdf)))

(defmethod fingerprinter Category
  [_ _]
  (redux/post-complete
   (redux/fuse {:histogram   h/histogram-categorical
                :cardinality cardinality})
   (fn [{:keys [histogram cardinality]}]
     (let [nil-count   (h/nil-count histogram)
           total-count (h/total-count histogram)
           unique%     (/ cardinality (max total-count 1))]
       {:histogram            histogram
        :cardinality-vs-count unique%
        :nil%                 (/ nil-count (max total-count 1))
        :has-nils?            (pos? nil-count)
        :cardinality          cardinality
        :count                total-count
        :entropy              (h/entropy histogram)
        :type                 Category}))))

(defmethod comparison-vector Category
  [fingerprint]
  (dissoc fingerprint :type :cardinality :field :has-nils?))

(defmethod prettify Category
  [fingerprint]
  (update fingerprint :histogram h/pdf))

(defmethod fingerprinter :default
  [_ field]
  (redux/post-complete
   (redux/fuse {:total-count stats/count
                :nil-count   (redux/with-xform stats/count (filter nil?))})
   (fn [{:keys [total-count nil-count]}]
     {:count     total-count
      :nil%      (/ nil-count (max total-count 1))
      :has-nils? (pos? nil-count)
      :type      [nil (field-type field)]})))

(prefer-method fingerprinter Category Text)
(prefer-method fingerprinter Num Category)
