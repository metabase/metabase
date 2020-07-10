(ns metabase.sync.analyze.fingerprint.fingerprinters
  "Non-identifying fingerprinters for various field types."
  (:require [bigml.histogram.core :as hist]
            [cheshire.core :as json]
            [java-time :as t]
            [kixi.stats
             [core :as stats]
             [math :as math]]
            [medley.core :as m]
            [metabase.models.field :as field]
            [metabase.sync.analyze.classifiers.name :as classify.name]
            [metabase.sync.util :as sync-util]
            [metabase.util :as u]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [deferred-trs trs]]]
            [redux.core :as redux])
  (:import com.bigml.histogram.Histogram
           com.clearspring.analytics.stream.cardinality.HyperLogLogPlus
           [java.time.chrono ChronoLocalDateTime ChronoZonedDateTime]
           java.time.temporal.Temporal
           java.time.ZoneOffset))

(defn col-wise
  "Apply reducing functinons `rfs` coll-wise to a seq of seqs."
  [& rfs]
  (fn
    ([] (mapv (fn [rf] (rf)) rfs))
    ([accs] (mapv (fn [rf acc] (rf (unreduced acc))) rfs accs))
    ([accs row]
     (let [all-reduced? (volatile! true)
           results      (mapv (fn [rf acc x]
                                (if-not (reduced? acc)
                                  (do (vreset! all-reduced? false)
                                      (rf acc x))
                                  acc))
                              rfs accs row)]
       (if @all-reduced?
         (reduced results)
         results)))))

(defn constant-fingerprinter
  "Constantly return `init`."
  [init]
  (fn
    ([] (reduced init))
    ([_] init)
    ([_ _] (reduced init))))

(defn- cardinality
  "Transducer that sketches cardinality using HyperLogLog++.
   https://research.google.com/pubs/pub40671.html"
  ([] (HyperLogLogPlus. 14 25))
  ([^HyperLogLogPlus acc] (.cardinality acc))
  ([^HyperLogLogPlus acc x]
   (.offer acc x)
   acc))

(defmacro robust-map
  "Wrap each map value in try-catch block."
  [& kvs]
  `(hash-map ~@(apply concat (for [[k v] (partition 2 kvs)]
                               `[~k (try
                                      ~v
                                      (catch Throwable _#))]))))

(defmacro ^:private with-reduced-error
  [msg & body]
  `(let [result# (sync-util/with-error-handling ~msg ~@body)]
     (if (instance? Throwable result#)
       (reduced result#)
       result#)))

(defn with-error-handling
  "Wrap `rf` in an error-catching transducer."
  [rf msg]
  (fn
    ([] (with-reduced-error msg (rf)))
    ([acc]
     (unreduced
      (if (or (reduced? acc)
              (instance? Throwable acc))
        acc
        (with-reduced-error msg (rf acc)))))
    ([acc e] (with-reduced-error msg (rf acc e)))))

(defn robust-fuse
  "Like `redux/fuse` but wraps every reducing fn in `with-error-handling` and returns `nil` for
   that fn if an error has been encountered during transducing."
  [kfs]
  (redux/fuse (m/map-kv-vals (fn [k f]
                               (redux/post-complete
                                (with-error-handling f (deferred-trs "Error reducing {0}" (name k)))
                                (fn [result]
                                  (when-not (instance? Throwable result)
                                    result))))
                             kfs)))

(defmulti fingerprinter
  "Return a fingerprinter transducer for a given field based on the field's type."
  {:arglists '([field])}
  (fn [{:keys [base_type special_type unit] :as field}]
    [(cond
       (u.date/extract-units unit)     :type/Integer
       (field/unix-timestamp? field)   :type/DateTime
       ;; for historical reasons the Temporal fingerprinter is still called `:type/DateTime` so anything that derives
       ;; from `Temporal` (such as DATEs and TIMEs) should still use the `:type/DateTime` fingerprinter
       (isa? base_type :type/Temporal) :type/DateTime
       :else                           base_type)
     (or special_type :type/*)]))

(def ^:private global-fingerprinter
  (redux/post-complete
   (robust-fuse {:distinct-count cardinality
                 :nil%           (stats/share nil?)})
   (partial hash-map :global)))

(defmethod fingerprinter :default
  [_]
  global-fingerprinter)

(defmethod fingerprinter [:type/* :type/FK]
  [_]
  global-fingerprinter)

(defmethod fingerprinter [:type/* :type/PK]
  [_]
  (constant-fingerprinter nil))

(prefer-method fingerprinter [:type/* :type/FK] [:type/Number :type/*])
(prefer-method fingerprinter [:type/* :type/FK] [:type/Text :type/*])
(prefer-method fingerprinter [:type/* :type/PK] [:type/Number :type/*])
(prefer-method fingerprinter [:type/* :type/PK] [:type/Text :type/*])
(prefer-method fingerprinter [:type/DateTime :type/*] [:type/* :type/PK])
(prefer-method fingerprinter [:type/DateTime :type/*] [:type/* :type/FK])

(defn- with-global-fingerprinter
  [fingerprinter]
  (redux/post-complete
   (redux/juxt
    fingerprinter
    global-fingerprinter)
   (fn [[type-fingerprint global-fingerprint]]
     (merge global-fingerprint
            type-fingerprint))))

(defmacro ^:private deffingerprinter
  [field-type transducer]
  (let [field-type (if (vector? field-type)
                     field-type
                     [field-type :type/*])]
    `(defmethod fingerprinter ~field-type
       [field#]
       (with-error-handling
         (with-global-fingerprinter
           (redux/post-complete
            ~transducer
            (fn [fingerprint#]
              {:type {~(first field-type) fingerprint#}})))
         (trs "Error generating fingerprint for {0}" (sync-util/name-for-logging field#))))))

(declare ->temporal)

(defn- earliest
  ([] nil)
  ([acc]
   (some-> acc u.date/format))
  ([acc t]
   (if (and t acc (t/before? t acc))
     t
     (or acc t))))

(defn- latest
  ([] nil)
  ([acc]
   (some-> acc u.date/format))
  ([acc t]
   (if (and t acc (t/after? t acc))
     t
     (or acc t))))

(defprotocol ^:private ITemporalCoerceable
  "Protocol for converting objects in resultset to a `java.time` temporal type."
  (->temporal ^java.time.temporal.Temporal [this]
    "Coerce object to a `java.time` temporal type."))

(extend-protocol ITemporalCoerceable
  nil      (->temporal [_]    nil)
  String   (->temporal [this] (->temporal (u.date/parse this)))
  Long     (->temporal [this] (->temporal (t/instant this)))
  Integer  (->temporal [this] (->temporal (t/instant this)))
  ChronoLocalDateTime (->temporal [this] (.toInstant this (ZoneOffset/UTC)))
  ChronoZonedDateTime (->temporal [this] (.toInstant this))
  Temporal (->temporal [this] this))

(deffingerprinter :type/DateTime
  ((map ->temporal)
   (robust-fuse {:earliest earliest
                 :latest   latest})))

(defn- histogram
  "Transducer that summarizes numerical data with a histogram."
  ([] (hist/create))
  ([^Histogram histogram] histogram)
  ([^Histogram histogram x] (hist/insert-simple! histogram x)))

(defn real-number?
  "Is `x` a real number (i.e. not a `NaN` or an `Infinity`)?"
  [x]
  (and (number? x)
       (not (Double/isNaN x))
       (not (Double/isInfinite x))))

(deffingerprinter :type/Number
  (redux/post-complete
   ((filter real-number?) histogram)
   (fn [h]
     (let [{q1 0.25 q3 0.75} (hist/percentiles h 0.25 0.75)]
       (robust-map
        :min (hist/minimum h)
        :max (hist/maximum h)
        :avg (hist/mean h)
        :sd  (some-> h hist/variance math/sqrt)
        :q1  q1
        :q3  q3)))))

(defn- valid-serialized-json?
  "Is x a serialized JSON dictionary or array."
  [x]
  (u/ignore-exceptions
    ((some-fn map? sequential?) (json/parse-string x))))

(deffingerprinter :type/Text
  ((map str) ; we cast to str to support `field-literal` type overwriting:
             ; `[:field-literal "A_NUMBER" :type/Text]` (which still
             ; returns numbers in the result set)
   (robust-fuse {:percent-json   (stats/share valid-serialized-json?)
                 :percent-url    (stats/share u/url?)
                 :percent-email  (stats/share u/email?)
                 :average-length ((map count) stats/mean)})))

(defn fingerprint-fields
  "Return a transducer for fingerprinting a resultset with fields `fields`."
  [fields]
  (apply col-wise (for [field fields]
                    (fingerprinter
                     (cond-> field
                       ;; Try to get a better guestimate of what we're dealing with on first sync
                       (every? nil? ((juxt :special_type :last_analyzed) field))
                       (assoc :special_type (classify.name/infer-special-type field)))))))
