(ns metabase.fingerprinting
  (:require [bigml.histogram.core :as hist]
            [bigml.sketchy.hyper-loglog :as hyper-loglog]
            [kixi.stats.core :as stats]
            [kixi.stats.math :as math]
            [redux.core :as redux]
            [clj-time.core :as t]
            [clj-time.format :as t.format]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]]
                             [segment :refer [Segment]]
                             [card :refer [Card]])
            [toucan.db :as db]
            [metabase.db.metadata-queries :as metadata]
            [clj-time.coerce :as coerce]))

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

(defmulti fingerprinter :base_type)

(defmethod fingerprinter :type/Number
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
     (let [var (hist/variance histogram)
           sd (math/sqrt var)
           min (hist/minimum histogram)
           max (hist/maximum histogram)
           mean (hist/mean histogram)
           median (hist/median histogram)
           nil-count (nil-count histogram)
           total-count (total-count histogram)
           range (- max min)]
       {:histogram (bins histogram)
        :percentiles (apply hist/percentiles histogram percentiles)
        :sum sum
        :sum-of-squares sum-of-squares
        :positive-definite? (>= min 0)
        :%>mean (- 1 ((hist/cdf histogram) mean))
        :cardinality-vs-count (/ cardinality total-count)
        :var>sd? (> var sd)
        :nil-conunt nil-count
        :has-nils? (pos? nil-count)
        :0<=x<=1? (<= 0 min max 1)
        :-1<=x<=1? (<= -1 min max 1)
        :range-vs-sd (/ range sd)
        :range-vs-spread (/ range (- mean median))
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
        :all-distinct? (>= (/ cardinality total-count)
                           (- 1 cardinality-error))
        :entropy (binned-entropy histogram)}))))

(defmethod fingerprinter :type/Text
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
        :has-nils? (pos? nil-count)}))))

(defn- quarter
  [dt]
  (Math/ceil (/ (t/month dt) 3)))

(defmethod fingerprinter :type/DateTime
  [field]
  (redux/post-complete
   (redux/pre-step
    (redux/fuse {:histogram (histogram (stats/somef coerce/to-long))
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
        :entropy (binned-entropy histogram)}))))

(defmethod fingerprinter :type/Category
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
        :entropy (binned-entropy histogram)}))))

(defmulti fingerprint (fn [_ x] (class x)))

(def ^:private ^:const max-sample-size 10000)

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (< (or max-cost 5) 3) (assoc :limit max-sample-size)))

(defn fingerprint-field
  [{:keys [field data]}]
  (transduce identity (fingerprinter field) data))

(defmethod fingerprint (class Field)
  [opts field]
  (assoc (fingerprint-field (metadata/field-values field (extract-query-opts opts)))
    :field field))

(defn- fingerprint-query
  [query-result]
  (into {}
    (for [[col field] query-result]
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
                      (:db_id (db/select-one 'Table :id (:table_id segment)))
                      (merge (extract-query-opts opts)
                             (:definition segment)))))

(defn compare-fingerprints
  [opts a b]
  {(:name a) (fingerprint opts a)
   (:name b) (fingerprint opts b)})

;; TODO unify Card and Segment fields with the rest
