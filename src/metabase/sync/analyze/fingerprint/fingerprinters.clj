(ns metabase.sync.analyze.fingerprint.fingerprinters
  "Non-identifying fingerprinters for various field types."
  (:require
   [bigml.histogram.core :as hist]
   [java-time.api :as t]
   [kixi.stats.core :as stats]
   [kixi.stats.math :as math]
   [medley.core :as m]
   [metabase.sync.analyze.classifiers.name :as classifiers.name]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [redux.core :as redux])
  (:import
   (com.bigml.histogram Histogram)
   (com.clearspring.analytics.stream.cardinality HyperLogLogPlus)
   (java.time ZoneOffset)
   (java.time.chrono ChronoLocalDateTime ChronoZonedDateTime)
   (java.time.temporal Temporal)))

(set! *warn-on-reflection* true)

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
                                (with-error-handling f (format "Error reducing %s" (name k)))
                                (fn [result]
                                  (when-not (instance? Throwable result)
                                    result))))
                             kfs)))

(defmulti fingerprinter
  "Return a fingerprinter transducer for a given field based on the field's type."
  {:arglists '([field])}
  (fn [{base-type :base_type, effective-type :effective_type, semantic-type :semantic_type, :keys [unit]}]
    [(cond
       (u.date/extract-units unit)
       :type/Integer

       ;; for historical reasons the Temporal fingerprinter is still called `:type/DateTime` so anything that derives
       ;; from `Temporal` (such as DATEs and TIMEs) should still use the `:type/DateTime` fingerprinter
       (isa? (or effective-type base-type) :type/Temporal)
       :type/DateTime

       :else
       base-type)
     (if (isa? semantic-type :Semantic/*)
       semantic-type
       :Semantic/*)
     (if (isa? semantic-type :Relation/*)
       semantic-type
       :Relation/*)]))

(def ^:private global-fingerprinter
  (redux/post-complete
   (robust-fuse {:distinct-count cardinality
                 :nil%           (stats/share nil?)})
   (partial hash-map :global)))

(defmethod fingerprinter :default
  [_]
  global-fingerprinter)

(defmethod fingerprinter [:type/* :Semantic/* :type/FK]
  [_]
  global-fingerprinter)

(defmethod fingerprinter [:type/* :Semantic/* :type/PK]
  [_]
  (constant-fingerprinter nil))

(prefer-method fingerprinter [:type/*        :Semantic/* :type/FK]    [:type/Number :Semantic/* :Relation/*])
(prefer-method fingerprinter [:type/*        :Semantic/* :type/FK]    [:type/Text   :Semantic/* :Relation/*])
(prefer-method fingerprinter [:type/*        :Semantic/* :type/PK]    [:type/Number :Semantic/* :Relation/*])
(prefer-method fingerprinter [:type/*        :Semantic/* :type/PK]    [:type/Text   :Semantic/* :Relation/*])
(prefer-method fingerprinter [:type/DateTime :Semantic/* :Relation/*] [:type/*      :Semantic/* :type/PK])
(prefer-method fingerprinter [:type/DateTime :Semantic/* :Relation/*] [:type/*      :Semantic/* :type/FK])

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
  {:pre [(keyword? field-type)]}
  (let [field-type [field-type :Semantic/* :Relation/*]]
    `(defmethod fingerprinter ~field-type
       [field#]
       (with-error-handling
         (with-global-fingerprinter
           (redux/post-complete
            ~transducer
            (fn [fingerprint#]
              {:type {~(first field-type) fingerprint#}})))
         (format "Error generating fingerprint for %s" (sync-util/name-for-logging field#))))))

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
  Temporal (->temporal [this] this)
  java.util.Date (->temporal [this] (t/instant this)))

(deffingerprinter :type/DateTime
  ((map ->temporal)
   (robust-fuse {:earliest earliest
                 :latest   latest})))

(defn- histogram
  "Transducer that summarizes numerical data with a histogram."
  ([] (hist/create))
  ([^Histogram histogram] histogram)
  ([^Histogram histogram x] (hist/insert-simple! histogram x)))

(deffingerprinter :type/Number
  (redux/post-complete
   ((filter u/real-number?) histogram)
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
  "Is x a serialized JSON dictionary or array. Hueristically recognize maps and arrays. Uses the following strategies:
  - leading character {: assume valid JSON
  - leading character [: assume valid json unless its of the form [ident] where ident is not a boolean."
  [x]
  (u/ignore-exceptions
    (when (and x (string? x))
      (let [matcher (case (first x)
                      \[ (fn bracket-matcher [s]
                           (cond (re-find #"^\[\s*(?:true|false)" s) true
                                 (re-find #"^\[\s*[a-zA-Z]" s) false
                                 :else true))
                      \{ (constantly true)
                      (constantly false))]
        (matcher x)))))

(deffingerprinter :type/Text
  ((map str) ; we cast to str to support `field-literal` type overwriting:
             ; `[:field-literal "A_NUMBER" :type/Text]` (which still
             ; returns numbers in the result set)
   (robust-fuse {:percent-json   (stats/share valid-serialized-json?)
                 :percent-url    (stats/share u/url?)
                 :percent-email  (stats/share u/email?)
                 :percent-state  (stats/share u/state?)
                 :average-length ((map count) stats/mean)})))

(defn fingerprint-fields
  "Return a transducer for fingerprinting a resultset with fields `fields`."
  [fields]
  (apply col-wise (for [field fields]
                    (fingerprinter
                     (cond-> field
                       ;; Try to get a better guestimate of what we're dealing with on first sync
                       (every? nil? ((juxt :semantic_type :last_analyzed) field))
                       (assoc :semantic_type (classifiers.name/infer-semantic-type field)))))))
