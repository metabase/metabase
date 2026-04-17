(ns metabase.analyze.fingerprint.fingerprinters
  "Non-identifying fingerprinters for various field types."
  (:require
   [bigml.histogram.core :as hist]
   [clojure.string :as str]
   [java-time.api :as t]
   [kixi.stats.core :as stats]
   [kixi.stats.math :as math]
   [medley.core :as m]
   [metabase.analyze.classifiers.name :as classifiers.name]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log]
   [metabase.util.performance :as perf]
   [redux.core :as redux])
  (:import
   (com.bigml.histogram Histogram)
   (com.clearspring.analytics.stream.cardinality HyperLogLogPlus)
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZoneOffset ZonedDateTime)
   (java.time.chrono ChronoLocalDateTime ChronoZonedDateTime)
   (java.time.temporal ChronoField Temporal)))

(set! *warn-on-reflection* true)

(defn col-wise
  "Apply reducing functions `rfs` coll-wise to a seq of seqs."
  [& rfs]
  (let [rfs (vec rfs)]
    (fn
      ([] (perf/mapv (fn [rf] (rf)) rfs))
      ([accs] (perf/mapv (fn [rf acc] (rf (unreduced acc))) rfs accs))
      ([accs row]
       (let [all-reduced? (volatile! true)
             results      (perf/mapv (fn [rf acc x]
                                       (if-not (reduced? acc)
                                         (do (vreset! all-reduced? false)
                                             (rf acc x))
                                         acc))
                                     rfs accs row)]
         (if @all-reduced?
           (reduced results)
           results))))))

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

(defmacro ^:private do-with-error-handling
  "This macro and its usage is written in a specific way to ensure that try-catch blocks don't produce closures."
  [form action-on-exception msg]
  `(if sync-util/*log-exceptions-and-continue?*
     (try ~form
          (catch Throwable e#
            (metabase.util.log/warn e# ~msg)
            (~action-on-exception e#)))
     ~form))

(defn with-error-handling
  "Wrap `rf` in an error-catching transducer."
  [rf msg]
  ;; This function is written in a specific way to ensure that try-catch blocks don't produce closures.
  (fn
    ([]
     (do-with-error-handling (rf) reduced msg))
    ([acc]
     (if (or (reduced? acc)
             (instance? Throwable acc))
       (unreduced acc)
       (do-with-error-handling (unreduced (rf acc)) identity msg)))
    ([acc e]
     (do-with-error-handling (rf acc e) reduced msg))))

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

(def ^:private supported-coercions
  #{:Coercion/String->Temporal
    :Coercion/Bytes->Temporal
    :Coercion/Temporal->Temporal
    :Coercion/Number->Temporal
    :Coercion/String->Number
    ;; the numeric fingerprinter consider every number as a double
    :Coercion/Float->Integer})

(defn- ensure-coercion-is-supported [{coercion-strategy :coercion_strategy :as field}]
  (when coercion-strategy
    (when-not (some #(isa? coercion-strategy %) supported-coercions)
      (throw (ex-info (format "Coercion strategy %s not supported by fingerprinters" coercion-strategy) field)))))

(defn- fingerprinter-dispatch
  [{base-type :base_type, effective-type :effective_type, semantic-type :semantic_type, :keys [unit] :as field}]
  (ensure-coercion-is-supported field)
  [(cond
     (u.date/extract-units unit)
     :type/Integer

       ;; for historical reasons the Temporal fingerprinter is still called `:type/DateTime` so anything that derives
       ;; from `Temporal` (such as DATEs and TIMEs) should still use the `:type/DateTime` fingerprinter
     (isa? (or effective-type base-type) :type/Temporal)
     :type/DateTime

     :else
     (or effective-type base-type))
   (if (isa? semantic-type :Semantic/*)
     semantic-type
     :Semantic/*)
   (if (isa? semantic-type :Relation/*)
     semantic-type
     :Relation/*)])

(defmulti fingerprinter
  "Return a fingerprinter transducer for a given field based on the field's type."
  {:arglists '([field])}
  (fn [field]
    (do-with-error-handling
     (fingerprinter-dispatch field)
     (fn [_] nil)
     "Error during fingerprinter dispatch")))

(defn- global-fingerprinter []
  (redux/post-complete
   (robust-fuse {:distinct-count cardinality
                 :nil%           (stats/share nil?)})
   (partial hash-map :global)))

(defmethod fingerprinter :default
  [_]
  (global-fingerprinter))

(defmethod fingerprinter [:type/* :Semantic/* :type/FK]
  [_]
  (global-fingerprinter))

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
    (global-fingerprinter))
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
  Object   (->temporal [_]    nil)
  String   (->temporal [this] (->temporal (u.date/parse this)))
  Long     (->temporal [this] (->temporal (t/instant this)))
  Integer  (->temporal [this] (->temporal (t/instant this)))
  ChronoLocalDateTime (->temporal [this] (.toInstant this ZoneOffset/UTC))
  ChronoZonedDateTime (->temporal [this] (.toInstant this))
  Temporal (->temporal [this] this)
  java.util.Date (->temporal [this] (t/instant this)))

(def ^:private ^:const mode-stats-max-distinct
  "Maximum number of distinct values to track for mode-fraction / top-3-fraction computation.
   Values beyond this cap are counted toward total but not tracked individually. For typical
   10k-row samples, the true top values will almost always appear in the first 100 distinct
   values seen."
  100)

(defn- top-n-fraction
  "Given a map of value->count and a total row count, return the sum of the top-n counts
   divided by total. Returns nil if total is not positive."
  [counts total n]
  (when (pos? total)
    (/ (double (reduce + 0.0 (take n (sort > (vals counts)))))
       (double total))))

(defn- mode-stats
  "Reducer that tracks value frequencies (bounded at `mode-stats-max-distinct` entries)
   and, on completion, returns {:mode-fraction, :top-3-fraction}. High mode-fraction
   signals single-value dominance; high top-3-fraction with moderate mode-fraction signals
   bimodal / few-real-categories distributions."
  ([] [{} 0])
  ([[counts total]]
   {:mode-fraction  (top-n-fraction counts total 1)
    :top-3-fraction (top-n-fraction counts total 3)})
  ([[counts total] x]
   (cond
     (nil? x)                                    [counts (inc total)]
     (contains? counts x)                        [(update counts x inc) (inc total)]
     (< (count counts) mode-stats-max-distinct)  [(assoc counts x 1) (inc total)]
     :else                                       [counts (inc total)])))

(defn- ->millis-from-epoch
  "Coerce a `java.time.temporal.Temporal` (as produced by `->temporal`) to long epoch millis.
   Returns nil for unsupported types; callers typically wrap with `(keep ->millis-from-epoch)`
   to strip non-coerceable values."
  [t]
  (cond (instance? Instant t)        (.toEpochMilli ^Instant t)
        (instance? OffsetDateTime t) (.toEpochMilli (.toInstant ^OffsetDateTime t))
        (instance? ZonedDateTime t)  (.toEpochMilli (.toInstant ^ZonedDateTime t))
        (instance? LocalDate t)      (recur (t/offset-date-time t (t/local-time 0) (t/zone-offset 0)))
        (instance? LocalDateTime t)  (recur (t/offset-date-time t (t/zone-offset 0)))
        (instance? LocalTime t)      (recur (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset 0)))
        (instance? OffsetTime t)     (recur (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset t)))
        :else                        nil))

(defn- ^Temporal temporal->zoned
  "Promote a `Temporal` to a form whose ChronoField support covers DAY_OF_WEEK and
   HOUR_OF_DAY. `Instant` is coerced to UTC; all other types pass through unchanged
   (e.g. `LocalDate` still supports DAY_OF_WEEK; `LocalTime` still supports HOUR_OF_DAY;
   downstream extractors check `isSupported` per-field)."
  [^Temporal t]
  (if (instance? Instant t)
    (.atZone ^Instant t ZoneOffset/UTC)
    t))

(defn- temporal->weekday
  "Return 1-7 for Monday-Sunday, or nil if the Temporal has no day-of-week."
  [t]
  (let [^Temporal z (temporal->zoned t)]
    (when (.isSupported z ChronoField/DAY_OF_WEEK)
      (.get z ChronoField/DAY_OF_WEEK))))

(defn- temporal->hour
  "Return 0-23 for hour-of-day, or nil if the Temporal has no hour."
  [t]
  (let [^Temporal z (temporal->zoned t)]
    (when (.isSupported z ChronoField/HOUR_OF_DAY)
      (.get z ChronoField/HOUR_OF_DAY))))

(defn- bucket-distribution
  "Reducer factory: returns a reducer that bucketizes values via `bucket-fn` into `n-buckets`
   slots and, on completion, returns a vector of per-bucket fractions (summing to 1.0).
   Values where `bucket-fn` returns nil or out-of-range are skipped. Returns nil if no
   valid values were seen."
  [n-buckets bucket-fn]
  (fn
    ([] [(vec (repeat n-buckets 0)) 0])
    ([[buckets total]]
     (when (pos? total)
       (mapv #(/ (double %) (double total)) buckets)))
    ([[buckets total] x]
     (if-let [idx (bucket-fn x)]
       (if (and (<= 0 idx) (< idx n-buckets))
         [(update buckets idx inc) (inc total)]
         [buckets total])
       [buckets total]))))

(defn- weekday-distribution
  "Reducer producing a 7-element vector of per-weekday fractions (Monday=index 0 .. Sunday=6)."
  []
  (bucket-distribution 7 (fn [t]
                           (when-let [dow (temporal->weekday t)]
                             (dec dow)))))

(defn- hour-distribution
  "Reducer producing a 24-element vector of per-hour fractions (0..23)."
  []
  (bucket-distribution 24 temporal->hour))

(deffingerprinter :type/DateTime
  ((map ->temporal)
   (redux/post-complete
    (robust-fuse {:earliest             earliest
                  :latest               latest
                  :skewness             ((keep ->millis-from-epoch) stats/skewness)
                  :mode-stats           ((keep ->millis-from-epoch) mode-stats)
                  :weekday-distribution (weekday-distribution)
                  :hour-distribution    (hour-distribution)})
    (fn [{:keys [mode-stats] :as fused}]
      (-> fused
          (dissoc :mode-stats)
          (assoc :mode-fraction  (:mode-fraction mode-stats)
                 :top-3-fraction (:top-3-fraction mode-stats)))))))

(defn- histogram
  "Transducer that summarizes numerical data with a histogram."
  ([] (hist/create))
  ([^Histogram histogram] histogram)
  ([^Histogram histogram x] (hist/insert-simple! histogram x)))

(defprotocol ^:private INumberCoerceable
  "Protocol for converting objects to a java.lang.Number."
  (->number ^Number [this] "Coerce object to a java.lang.Number"))

(extend-protocol INumberCoerceable
  nil (->number [_] nil)
  Object (->number [_] nil)
  Boolean (->number [this] (if this 1 0))
  Number (->number [this] this)
  String (->number [this]
           ;; faster to be optimistic and fail than to explicitly test and dispatch
           (or (parse-long this)
               (parse-double this))))

(deffingerprinter :type/Number
  (redux/post-complete
   ((comp (map ->number) (filter u/real-number?))
    (redux/juxt histogram stats/skewness stats/kurtosis mode-stats (stats/share zero?)))
   (fn [[h sk ku ms zf]]
     (let [{q1 0.25 q3 0.75} (hist/percentiles h 0.25 0.75)]
       (robust-map
        :min             (hist/minimum h)
        :max             (hist/maximum h)
        :avg             (hist/mean h)
        :sd              (some-> h hist/variance math/sqrt)
        :q1              q1
        :q3              q3
        :skewness        sk
        :excess-kurtosis ku
        :mode-fraction   (:mode-fraction ms)
        :top-3-fraction  (:top-3-fraction ms)
        :zero-fraction   zf)))))

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
   (redux/post-complete
    (robust-fuse {:percent-json   (stats/share valid-serialized-json?)
                  :percent-url    (stats/share u/url?)
                  :percent-email  (stats/share u/email?)
                  :percent-state  (stats/share u/state?)
                  :average-length ((map count) stats/mean)
                  :min-length     ((map count) stats/min)
                  :max-length     ((map count) stats/max)
                  :mode-stats     mode-stats
                  :blank%         (stats/share str/blank?)})
    (fn [{:keys [mode-stats] :as fused}]
      (-> fused
          (dissoc :mode-stats)
          (assoc :mode-fraction  (:mode-fraction mode-stats)
                 :top-3-fraction (:top-3-fraction mode-stats)))))))

(defn fingerprint-fields
  "Return a transducer for fingerprinting a resultset with fields `fields`."
  [fields]
  (apply col-wise (for [field fields]
                    (fingerprinter
                     (cond-> field
                       ;; Try to get a better guestimate of what we're dealing with on first sync
                       (every? nil? ((juxt :semantic_type :last_analyzed) field))
                       (assoc :semantic_type (classifiers.name/infer-semantic-type-by-name field)))))))
