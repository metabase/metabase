(ns metabase.fingerprinting
  (:require [bigml.histogram.core :as hist]
            [bigml.sketchy.hyper-loglog :as hyper-loglog]
            [kixi.stats.core :as stats]
            [kixi.stats.math :as math]
            [redux.core :as redux]
            (clj-time [core :as t]
                      [format :as t.format]
                      [periodic :as t.periodic]
                      [coerce :as t.coerce])
            [tide.core :as tide]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]]
                             [segment :refer [Segment]]
                             [card :refer [Card]])
            [toucan.db :as db]
            [metabase.db.metadata-queries :as metadata]))

(def ^:private ^:const ^Double cardinality-error 0.01)

(def ^:private ^:const percentiles (range 0 1 0.1))

(defn histogram
  ([] (histogram identity))
  ([f]
   (fn
     ([] (hist/create))
     ([acc] acc)
     ([acc x] (hist/insert! acc (f x))))))

(defn histogram-categorical
  ([] (histogram-categorical identity))
  ([f]
   (fn
     ([] (hist/create))
     ([acc] acc)
     ([acc x]
      (let [fx (f x)]
        (hist/insert-categorical! acc (when fx 1) fx))))))

(defn rollup
  [groupfn f]
  (fn
    ([] {})
    ([acc]
     (reduce (fn [acc k]
               (update acc k f))
             acc
             (keys acc)))
    ([acc x]
     (let [k (groupfn x)]
       (assoc acc k (f (get acc k (f)) x))))))

(defn safe-divide
  [numerator & denominators]
  (when (or (and (not-empty denominators) (not-any? zero? denominators))
            (and (not (zero? numerator)) (empty? denominators)))
    (double (apply / numerator denominators))))

(defn growth
  [b a]
  (safe-divide (* (if (neg? a) -1 1) (- b a)) a)) 

(defn- bins
  [histogram]
  (let [bins (hist/bins histogram)]
    (or (some->> bins first :target :counts (into {}))
        (into {}
          (map (juxt :mean :count))
          bins))))

(def ^:private nil-count (comp :count hist/missing-bin))

(defn total-count
  [histogram]
  (+ (hist/total-count histogram)
     (nil-count histogram)))

(defn cardinality
  ([] (hyper-loglog/create cardinality-error))
  ([acc] (hyper-loglog/distinct-count acc))
  ([acc x] (hyper-loglog/insert acc x)))

(defn binned-entropy
  [histogram]
  (let [total (hist/total-count histogram)]
    (transduce (comp (map :count)
                     (filter pos?)
                     (map #(let [p (/ % total)]
                             (* p (math/log p)))))
               (redux/post-complete + -)
               (hist/bins histogram))))

(defn- field-type
  [field]
  (if (sequential? field)
    (mapv field-type field)
    [(:base_type field) (or (:special_type field) :type/Nil)]))

(def Num [:type/Number :type/*])
(def DateTime [:type/DateTime :type/*])
(def Category [:type/* :type/Category])
(def Any [:type/* :type/*])
(def Text [:type/Text :type/*])

(defmulti fingerprinter field-type)

(defmethod fingerprinter Num
  [field]
  (redux/post-complete
   (redux/fuse {:histogram (histogram)
                :cardinality cardinality
                :kurtosis stats/kurtosis
                :skewness stats/skewness
                :sum (redux/with-xform + (remove nil?))
                :sum-of-squares (redux/with-xform + (comp (remove nil?)
                                                          (map #(* % %))))})
   (fn [{:keys [histogram cardinality kurtosis skewness sum sum-of-squares]}]
     (let [nil-count (nil-count histogram)
           total-count (total-count histogram)           
           unique% (/ cardinality (max total-count 1))
           var (hist/variance histogram)
           sd (math/sqrt var)
           min (hist/minimum histogram)
           max (hist/maximum histogram)
           mean (hist/mean histogram)
           median (hist/median histogram)
           range (- max min)]
       {:histogram (bins histogram)
        :percentiles (apply hist/percentiles histogram percentiles)
        :sum sum
        :sum-of-squares sum-of-squares
        :positive-definite? (>= min 0)
        :%>mean (- 1 ((hist/cdf histogram) mean))
        :cardinality-vs-count unique%
        :var>sd? (> var sd)
        :nil-conunt nil-count
        :has-nils? (pos? nil-count)
        :0<=x<=1? (<= 0 min max 1)
        :-1<=x<=1? (<= -1 min max 1)
        :range-vs-sd (when (pos? sd)
                       (/ range sd))
        :range-vs-spread (when (not= mean median)
                           (/ range (- mean median)))
        :cardinality cardinality
        :min min
        :max max
        :mean mean
        :median median
        :var var
        :sd sd
        :count total-count
        :kurtosis kurtosis
        :skewness skewness
        :all-distinct? (>= unique%
                           (- 1 cardinality-error))
        :entropy (binned-entropy histogram)
        :type Number}))))

(defmethod fingerprinter [Num Num]
  [[x y]]
  (redux/fuse {:correlation (stats/correlation first second)
               :covariance (stats/covariance first second)
               :linear-regression (stats/simple-linear-regression first second)}))

(def ^:private ^:cost timestamp-truncation-factor (/ 1 1000 60 60 24))

(def ^:private truncate-timestamp (partial * timestamp-truncation-factor))

(defn- fill-timeseries
  [ts]
  (let [start (-> ts ffirst (/ timestamp-truncation-factor) long t.coerce/from-long)
        ts-index (into {} ts)]
    (into []
      (comp (map (comp truncate-timestamp t.coerce/to-long))
            (take-while (partial >= (-> ts last first)))
            (map (fn [t]
                   [t (ts-index t 0)])))
      (t.periodic/periodic-seq start (t/months 1)))))

(defmethod fingerprinter [DateTime Num]
  [[x y]]
  (redux/pre-step
   (redux/post-complete
    (redux/fuse {:linear-regression (stats/simple-linear-regression first second)
                 :series (redux/post-complete conj fill-timeseries)})
    (fn [{:keys [series linear-regression]}]
      (let [{:keys [trend seasonal reminder]} (tide/decompose 12 series)
            ys-r (reverse (map second series))]
        (println [(map (fn [[t x]]
                         [(-> t
                              (* timestamp-truncation-factor)
                              long
                              t.coerce/from-long)
                          x]) series) ys-r])
        {:series series         
         :linear-regression linear-regression
         :trend trend
         :seasonal seasonal
         :reminder reminder
         :YoY (growth (first ys-r) (nth ys-r 11))
         :YoY-previous (growth (second ys-r) (nth ys-r 12))
         :MoM (growth (first ys-r) (second ys-r))
         :MoM-previous (growth (second ys-r) (nth ys-r 2))})))
   (fn [[x y]]     
     [(-> x t.format/parse t.coerce/to-long truncate-timestamp) y])))

(defmethod fingerprinter [Category Any]
  [[x y]]
  (rollup first (redux/pre-step (fingerprinter y) second)))

(defmethod fingerprinter Text
  [field]
  (redux/post-complete
   (redux/fuse {:histogram (histogram (stats/somef count))})
   (fn [{:keys [histogram]}]
     (let [nil-count (nil-count histogram)]
       {:min (hist/minimum histogram)
        :max (hist/maximum histogram)
        :hisogram (bins histogram)
        :count (total-count histogram)
        :nil-conunt nil-count
        :has-nils? (pos? nil-count)
        :type Text}))))

(defn- quarter
  [dt]
  (Math/ceil (/ (t/month dt) 3)))

(defmethod fingerprinter DateTime
  [field]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:histogram (histogram (stats/somef t.coerce/to-long))
                 :histogram-hour (histogram-categorical (stats/somef t/hour))
                 :histogram-day (histogram-categorical (stats/somef t/day-of-week))
                 :histogram-month (histogram-categorical (stats/somef t/month))
                 :histogram-quarter (histogram-categorical (stats/somef quarter))})
    t.format/parse)
   (fn [{:keys [histogram histogram-hour histogram-day histogram-month
                histogram-quarter]}]
     (let [nil-count (nil-count histogram)]
       {:min (hist/minimum histogram)
        :max (hist/maximum histogram)
        :hisogram (bins histogram)
        :percentiles (apply hist/percentiles histogram percentiles)
        :hisogram-hour (bins histogram-hour)
        :hisogram-day (bins histogram-day)
        :hisogram-month (bins histogram-month)
        :hisogram-quarter (bins histogram-quarter)
        :count (total-count histogram)
        :nil-conunt nil-count
        :has-nils? (pos? nil-count)
        :entropy (binned-entropy histogram)
        :type DateTime}))))

(defmethod fingerprinter Category
  [field]
  (redux/post-complete
   (redux/fuse {:histogram (histogram-categorical)
                :cardinality cardinality})
   (fn [{:keys [histogram cardinality]}]
     (let [nil-count (nil-count histogram)
           total-count (total-count histogram)]
       {:histogram (bins histogram)
        :cardinality-vs-count (/ cardinality total-count)
        :nil-conunt nil-count
        :has-nils? (pos? nil-count)
        :cardinality cardinality
        :count total-count
        :all-distinct? (>= (/ cardinality total-count)
                           (- 1 cardinality-error))
        :entropy (binned-entropy histogram)
        :type Category}))))

(prefer-method fingerprinter Category Text)
(prefer-method fingerprinter Num Category)

(defmulti fingerprint (fn [_ x] (class x)))

(def ^:private ^:const max-sample-size 10000)

;; COSTS
;;
;; 1 - Don't touch anything, just use what we've already precomputed/cached.
;; 2 - Sample and limit computation to O(n).
;; 3 - Sample with unbounded computation.
;; 4 - Full table scan but limit computation to O(n).
;; 5 - Full table scan with unbounded computation.
;; 6 - Full table scan bringing in data from other tables if needed.
;;     Limit computation to O(n).
;; 7 - Full table scan bringing in data from other tables if needed
;;     and unbounded computation.
;; 8 - Sky's the limit (GPU, ML, ...).

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (some-> max-cost (< 4)) (assoc :limit max-sample-size)))

(defn fingerprint-field
  [{:keys [field data]}]
  (transduce identity (fingerprinter field) data))

(defmethod fingerprint (class Field)
  [opts field]
  (assoc (fingerprint-field (metadata/field-values field (extract-query-opts opts)))
    :field field))

(defn- transpose
  [{:keys [rows columns cols]}]
  (reduce (fn [acc row]
            (reduce (fn [acc [k v]]
                      (update-in acc [k :data] conj v))
                    acc
                    (map vector columns row)))
          (zipmap columns (for [c cols]
                            {:field c
                             :data []}))
          rows))

(defn- fingerprint-query
  [query-result]
  (into {}
    (for [[col field] (transpose query-result)]
      [col (fingerprint-field field)])))

(defmethod fingerprint (class Table)
  [opts table]
  (fingerprint-query (metadata/query-values
                      (:db_id table)
                      (merge (extract-query-opts opts)
                             {:source-table (:id table)}))))

(defmethod fingerprint (class Card)
  [opts card]
  (fingerprint-query (metadata/query-values
                      (:database_id card)
                      (merge (extract-query-opts opts)
                             (-> card :dataset_query :query)))))

(defmethod fingerprint (class Segment)
  [opts segment]
  (fingerprint-query (metadata/query-values
                      (db/select-one-field :db_id 'Table :id (:table_id segment))
                      (merge (extract-query-opts opts)
                             (:definition segment)))))

(defn compare-fingerprints
  [opts a b]
  {(:name a) (fingerprint opts a)
   (:name b) (fingerprint opts b)})

(defn multifield-fingerprint
  [opts a b]
  (assert (= (:table_id a) (:table_id b)))
  {:fields (compare-fingerprints opts a b)
   :fingerprint
   (fingerprint-field
    {:field [a b]
     :data (-> (metadata/query-values
                (db/select-one-field :db_id 'Table :id (:table_id a))
                (merge (extract-query-opts opts)
                       (if (isa? (field-type a) DateTime)
                         {:source-table (:table_id a)                         
                          :breakout [[:datetime-field [:field-id (:id a)] :month]]
                          :aggregation [:sum [:field-id (:id b)]]}
                         {:source-table (:table_id a)
                          :fields [[:field-id (:id a)]
                                   [:field-id (:id b)]]})))
               :rows)})})

;; TODO add db_id to Field, Card, and Segment
