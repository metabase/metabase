(ns metabase.fingerprinting
  "Fingerprinting (feature extraction) for various models."
  (:require [bigml.histogram.core :as hist]
            [bigml.sketchy.hyper-loglog :as hyper-loglog]
            [clj-time
             [coerce :as t.coerce]
             [core :as t]
             [format :as t.format]
             [periodic :as t.periodic]]
            [clojure
             [set :as set]
             [string :as s]]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [medley.core :as m]
            [metabase.db.metadata-queries :as metadata]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [redux.core :as redux]
            [tide.core :as tide])
  (import com.bigml.histogram.Histogram))

(def ^:private ^:const percentiles (range 0 1 0.1))

(defn histogram
  "Transducer that summarizes numerical data with a histogram."
  ([] (hist/create))
  ([histogram] histogram)
  ([histogram x] (hist/insert-simple! histogram x)))

(defn histogram-categorical
  "Transducer that summarizes categorical data with a histogram."
  ([] (hist/create))
  ([histogram] histogram)
  ([histogram x] (hist/insert-categorical! histogram (when x 1) x)))

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

(def ^:private ^:const ^Long pdf-sample-points 100)

(defn pdf
  "Probability density function for given histogram.
   Obtained by sampling density at `pdf-sample-points` from the histogram."
  [histogram]
  (or (some->> (hist/bins histogram)
               first
               :target
               :counts
               (map (let [norm (/ (hist/total-count histogram))]
                      (fn [[target count]]
                        [target (* count norm)]))))
      (let [{:keys [min max]} (hist/bounds histogram)
            step (/ (- max min) pdf-sample-points)]
        (transduce (take pdf-sample-points)
                   (fn
                     ([] {:total-count 0
                          :densities   (transient [])})
                     ([{:keys [total-count densities]}]
                      (for [[x count] (persistent! densities)]
                        [x (/ count total-count)]))
                     ([{:keys [total-count densities]} i]
                      (let [d (hist/density histogram i)]
                        {:densities   (conj! densities [i d])
                         :total-count (+ total-count d)})))
                   (iterate (partial + step) min)))))

(def ^{:arglists '([histogram])} nil-count
  "Return number of nil values histogram holds."
  (comp :count hist/missing-bin))

(defn total-count
  "Return total number of values histogram holds."
  [histogram]
  (+ (hist/total-count histogram)
     (nil-count histogram)))

(def ^:private ^:const ^Double cardinality-error 0.01)

(defn cardinality
  "Transducer that sketches cardinality using Hyper-LogLog."
  ([] (hyper-loglog/create cardinality-error))
  ([acc] (hyper-loglog/distinct-count acc))
  ([acc x] (hyper-loglog/insert acc x)))

(defn entropy
  "Calculate entropy of given histogram."
  [histogram]
  (transduce (comp (map second)
                   (remove zero?)
                   (map #(* % (math/log %))))
             (redux/post-complete + -)
             (pdf histogram)))

(def ^:private Num      [:type/Number :type/*])
(def ^:private DateTime [:type/DateTime :type/*])
(def ^:private Category [:type/* :type/Category])
(def ^:private Any      [:type/* :type/*])
(def ^:private Text     [:type/Text :type/*])

(defn- field-type
  [field]
  (cond
    (sequential? field)             (mapv field-type field)
    (instance? (type Metric) field) Num
    :else                           [(:base_type field)
                                     (or (:special_type field) :type/*)]))

(def linear-computation? ^:private ^{:arglists '([max-cost])}
  (comp #{:linear} :computation))

(def unbounded-computation? ^:private ^{:arglists '([max-cost])}
  (comp #{:unbounded :yolo} :computation))

(def yolo-computation? ^:private ^{:arglists '([max-cost])}
  (comp #{:yolo} :computation))

(def cache-only? ^:private ^{:arglists '([max-cost])}
  (comp #{:cache} :query))

(def sample-only? ^:private ^{:arglists '([max-cost])}
  (comp #{:sample} :query))

(def full-scan? ^:private ^{:arglists '([max-cost])}
  (comp #{:full-scan :joins} :query))

(def alow-joins? ^:private ^{:arglists '([max-cost])}
  (comp #{:joins} :query))

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
   (redux/fuse {:histogram      histogram
                :cardinality    cardinality
                :kurtosis       stats/kurtosis
                :skewness       stats/skewness
                :sum            (redux/with-xform + (remove nil?))
                :sum-of-squares (redux/with-xform + (comp (remove nil?)
                                                          (map math/sq)))})
   (fn [{:keys [histogram cardinality kurtosis skewness sum sum-of-squares]}]
     (if (pos? (total-count histogram))
       (let [nil-count   (nil-count histogram)
             total-count (total-count histogram)
             unique%     (/ cardinality (max total-count 1))
             var         (or (hist/variance histogram) 0)
             sd          (math/sqrt var)
             min         (hist/minimum histogram)
             max         (hist/maximum histogram)
             mean        (hist/mean histogram)
             median      (hist/median histogram)
             span        (- max min)]
         {:histogram            histogram
          :percentiles          (apply hist/percentiles histogram percentiles)
          :sum                  sum
          :sum-of-squares       sum-of-squares
          :positive-definite?   (>= min 0)
          :%>mean               (- 1 ((hist/cdf histogram) mean))
          :cardinality-vs-count unique%
          :var>sd?              (> var sd)
          :nil%                 (/ nil-count (clojure.core/max total-count 1))
          :has-nils?            (pos? nil-count)
          :0<=x<=1?             (<= 0 min max 1)
          :-1<=x<=1?            (<= -1 min max 1)
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
          :entropy              (entropy histogram)
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
  (update fingerprint :histogram pdf))

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
                            (unbounded-computation? max-cost))
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
   (redux/fuse {:histogram (redux/pre-step histogram (stats/somef count))})
   (fn [{:keys [histogram]}]
     (let [nil-count   (nil-count histogram)
           total-count (total-count histogram)]
       {:min        (hist/minimum histogram)
        :max        (hist/maximum histogram)
        :histogram  histogram
        :count      total-count
        :nil%       (/ nil-count (max total-count 1))
        :has-nils?  (pos? nil-count)
        :type       Text}))))

(defmethod prettify Text
  [fingerprint]
  (update fingerprint :histogram pdf))

(defn- quarter
  [dt]
  (-> (t/month dt) (/ 3) Math/ceil long))

(defmethod fingerprinter DateTime
  [_ _]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:histogram         (redux/pre-step histogram t.coerce/to-long)
                 :histogram-hour    (redux/pre-step histogram-categorical
                                                    (stats/somef t/hour))
                 :histogram-day     (redux/pre-step histogram-categorical
                                                    (stats/somef t/day-of-week))
                 :histogram-month   (redux/pre-step histogram-categorical
                                                    (stats/somef t/month))
                 :histogram-quarter (redux/pre-step histogram-categorical
                                                    (stats/somef quarter))})
    t.format/parse)
   (fn [{:keys [histogram histogram-hour histogram-day histogram-month
                histogram-quarter]}]
     (let [nil-count   (nil-count histogram)
           total-count (total-count histogram)]
       {:min               (hist/minimum histogram)
        :max               (hist/maximum histogram)
        :histogram         histogram
        :percentiles       (apply hist/percentiles histogram percentiles)
        :histogram-hour    histogram-hour
        :histogram-day     histogram-day
        :histogram-month   histogram-month
        :histogram-quarter histogram-quarter
        :count             total-count
        :nil%              (/ nil-count (max total-count 1))
        :has-nils?         (pos? nil-count)
        :entropy           (entropy histogram)
        :type              DateTime}))))

(defmethod comparison-vector DateTime
  [fingerprint]
  (dissoc fingerprint :type :percentiles :field :has-nils?))

(defmethod prettify DateTime
  [fingerprint]
  (-> fingerprint
      (update :min               from-double)
      (update :max               from-double)
      (update :histogram         (comp (partial m/map-keys from-double) pdf))
      (update :percentiles       (partial m/map-vals from-double))
      (update :hisotogram-hour   pdf)
      (update :hisotogram-day    pdf)
      (update :histogram-month   pdf)
      (update :histogram-quarter pdf)))

(defmethod fingerprinter Category
  [_ _]
  (redux/post-complete
   (redux/fuse {:histogram   histogram-categorical
                :cardinality cardinality})
   (fn [{:keys [histogram cardinality]}]
     (let [nil-count   (nil-count histogram)
           total-count (total-count histogram)
           unique%     (/ cardinality (max total-count 1))]
       {:histogram            histogram
        :cardinality-vs-count unique%
        :nil%                 (/ nil-count (max total-count 1))
        :has-nils?            (pos? nil-count)
        :cardinality          cardinality
        :count                total-count
        :entropy              (entropy histogram)
        :type                 Category}))))

(defmethod comparison-vector Category
  [fingerprint]
  (dissoc fingerprint :type :cardinality :field :has-nils?))

(defmethod prettify Category
  [fingerprint]
  (update fingerprint :histogram pdf))

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

(defn- fingerprint-field
  "Transduce given column with corresponding fingerprinter."
  [opts field data]
  (-> (transduce identity (fingerprinter opts field) data)
      (assoc :field field)))

(defn- fingerprint-query
  "Transuce each column in given dataset with corresponding fingerprinter."
  [opts {:keys [rows cols]}]
  (transduce identity
             (apply redux/juxt (map-indexed (fn [i field]
                                              (redux/post-complete
                                               (redux/pre-step
                                                (fingerprinter opts field)
                                                #(nth % i))
                                               #(assoc % :field field)))
                                            cols))
             rows))

(def ^:private ^:const ^Long max-sample-size 10000)

(defmulti fingerprint
  "Given a model, fetch corresponding dataset and compute its fingerprint.

   Takes a map of options as first argument. Recognized options:
   * `:max-cost`         a map with keys `:computation` and `:query` which
                         limits maximal resource expenditure when computing the
                         fingerprint. `:computation` can be one of `:linear`
                         (O(n) or better), `:unbounded`, or `:yolo` (full blown
                         machine learning etc.). `query` can be one of
                         `:cache` (use only cached data), `:sample` (sample
                         up to `max-sample-size` rows), `:full-scan` (full table
                         scan), or `:joins` (bring in data from other tables if
                         needed).

   * `:scale`            controls pre-aggregation by time. Can be one of `:day`,
                         `week`, `:month`, or `:raw`"
  #(type %2))

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (sample-only? max-cost) (assoc :limit max-sample-size)))

(defmethod fingerprint (type Field)
  [opts field]
  {:fingerprint (->> (metadata/field-values field (extract-query-opts opts))
                     (fingerprint-field opts field))})

(defmethod fingerprint (type Table)
  [opts table]
  {:constituents (fingerprint-query opts (metadata/query-values
                                          (:db_id table)
                                          (merge (extract-query-opts opts)
                                                 {:source-table (:id table)})))})

(defmethod fingerprint (type Card)
  [opts card]
  (let [{:keys [rows cols]} (metadata/query-values
                             (:database_id card)
                             (merge (extract-query-opts opts)
                                    (-> card :dataset_query :query)))
        {:keys [breakout aggregation]} (group-by :source cols)
        fields [(first breakout) (or (first aggregation) (second breakout))]]
    {:constituents [(fingerprint-field opts (first fields) (map first rows))
                    (fingerprint-field opts (second fields) (map second rows))]
     :fingerprint  (fingerprint-field opts fields rows)}))

(defmethod fingerprint (type Segment)
  [opts segment]
  {:constituents (fingerprint-query opts (metadata/query-values
                                          (metadata/db-id segment)
                                          (merge (extract-query-opts opts)
                                                 (:definition segment))))})

(defmethod fingerprint (type Metric)
  [_ metric]
  {:metric metric})

(defn- build-query
  [{:keys [scale] :as opts} a b]
  (merge (extract-query-opts opts)
         (cond
           (and (isa? (field-type a) DateTime)
                (not= scale :raw)
                (instance? (type Metric) b))
           (merge (:definition b)
                  {:breakout [[:datetime-field [:field-id (:id a)] scale]]})

           (and (isa? (field-type a) DateTime)
                (not= scale :raw)
                (isa? (field-type b) Num))
           {:source-table (:table_id a)
            :breakout     [[:datetime-field [:field-id (:id a)] scale]]
            :aggregation  [:sum [:field-id (:id b)]]}

           :else
           {:source-table (:table_id a)
            :fields       [[:field-id (:id a)]
                           [:field-id (:id b)]]})))

(defn multifield-fingerprint
  "Holistically fingerprint dataset with multiple columns.
   Takes and additional option `:scale` which controls how timeseries data
   is aggregated. Possible values: `:month`, `week`, `:day`, `:raw`."
  [opts a b]
  (assert (= (:table_id a) (:table_id b)))
  {:fingerprint  (->> (metadata/query-values (metadata/db-id a)
                                            (build-query opts a b))
                     :rows
                     (fingerprint-field opts [a b]))
   :constituents (map (partial fingerprint opts) [a b])})

(def magnitude
  "Transducer that claclulates magnitude (Euclidean norm) of given vector.
   https://en.wikipedia.org/wiki/Euclidean_distance"
  (redux/post-complete (redux/pre-step + math/sq) math/sqrt))

(defn cosine-distance
  "Cosine distance between vectors `a` and `b`.
   https://en.wikipedia.org/wiki/Cosine_similarity"
  [a b]
  (- 1 (/ (reduce + (map * a b))
          (transduce identity magnitude a)
          (transduce identity magnitude b))))

(defmulti difference
  "Difference between two features.
   Confined to [0, 1] with 0 being same, and 1 orthogonal."
  #(mapv type %&))

(defmethod difference [Number Number]
  [a b]
  (cond
    (every? zero? [a b]) 0
    (zero? (max a b))    1
    :else                (/ (- (max a b) (min a b))
                            (max a b))))

(defmethod difference [Boolean Boolean]
  [a b]
  (if (= a b) 0 1))

(defmethod difference [clojure.lang.Sequential clojure.lang.Sequential]
  [a b]
  (/ (cosine-distance a b) 2))


(defn chi-squared-distance
  "Chi-squared distane between empirical probability distributions `p` and `q`.
   https://stats.stackexchange.com/questions/184101/comparing-two-histograms-using-chi-square-distance"
  [p q]
  (reduce + (map (fn [pi qi]
                   (if (zero? (+ pi qi))
                     0
                     (/ (math/sq (- pi qi))
                        (+ pi qi))))
                 p q)))

(defn- unify-categories
  "Given two PMFs add missing categories and align them so they both cover the
   same set of categories."
  [pmf-a pmf-b]
  (let [categories-a (into #{} (map first) pmf-a)
        categories-b (into #{} (map first) pmf-b)]
    [(->> (set/difference categories-a categories-b)
          (map #(vector % 0))
          (concat pmf-a)
          (sort-by first))
     (->> (set/difference categories-b categories-a)
          (map #(vector % 0))
          (concat pmf-b)
          (sort-by first))]))

(defmethod difference [Histogram Histogram]
  [a b]
  (if (hist/target-type a)
    (let [[pdf-a pdf-b] (unify-categories (pdf a) (pdf b))]
      (chi-squared-distance (map second pdf-a) (map second pdf-b)))
    ;; We are only interested in the shape, hence scale-free comparison
    (chi-squared-distance (map second (pdf a)) (map second (pdf b)))))

(defn- flatten-map
  ([m] (flatten-map nil m))
  ([prefix m]
   (into {}
     (mapcat (fn [[k v]]
               (let [k (keyword (some-> prefix str (subs 1)) (name k))]
                 (if (map? v)
                   (flatten-map k v)
                   [[k v]]))))
     m)))

(defn pairwise-differences
  "Pairwise differences of (feature) vectors `a` and `b`."
  [a b]
  (into {}
    (map (fn [[k a] [_ b]]
           [k (difference a b)])
         (flatten-map (comparison-vector a))
         (flatten-map (comparison-vector b)))))

(def ^:private ^:const ^Double interestingness-thershold 0.2)

(defn fingerprint-distance
  "Distance metric between fingerprints `a` and `b`."
  [a b]
  (let [differences (pairwise-differences a b)]
    {:distance   (transduce (map val)
                            (redux/post-complete
                             magnitude
                             #(/ % (math/sqrt (count differences))))
                            differences)
     :components (sort-by val > differences)
     :thereshold interestingness-thershold}))

(defn compare-fingerprints
  "Compare fingerprints of two models."
  [opts a b]
  (assert (= (keys a) (keys b)))
  (let [[a b] (map (partial fingerprint opts) [a b])]
    {:constituents [a b]
     :comparison   (into {}
                     (map (fn [[k a] [_ b]]
                            [k (if (sequential? a)
                                 (map fingerprint-distance a b)
                                 (fingerprint-distance a b))])
                          a b))}))
