(ns metabase.analyze.fingerprint.fingerprinters
  "Non-identifying fingerprinters for various field types."
  (:require
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
   (java.time ZoneOffset)
   (java.time.chrono ChronoLocalDateTime ChronoZonedDateTime)
   (java.time.temporal Temporal)
   (org.apache.commons.codec.digest MurmurHash2)
   (org.apache.commons.math3.stat.descriptive SummaryStatistics)
   (org.apache.datasketches.hll HllSketch)
   (org.apache.datasketches.kll KllDoublesSketch)))

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
  "Transducer that sketches cardinality using DataSketches' HyperLogLog implementation."
  ([] (HllSketch. 16))
  ([^HllSketch acc] (Math/round (.getEstimate acc)))
  ([^HllSketch acc x]
   ;; Hashing is implemented in this way to ensure better overlap with results that the previously used
   ;; HyperLogLogPlus implementation produced.
   (let [h (cond (string? x) (MurmurHash2/hash64 ^String x)
                 (bytes? x) (MurmurHash2/hash64 ^bytes x (alength ^bytes x))
                 :else (hash x))]
     (.update acc ^long h)
     acc)))

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

(def ^:private mode-stats-max-distinct
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

(deftype ^:private ModeStatsTracker [^:volatile-mutable counts, ^:volatile-mutable ^long total]
  ;; Save the trouble of introducing a dedicated protocol/interface to interact with mutable fields by implementing
  ;; two arities of IFn interface.
  clojure.lang.IFn
  (invoke [_]
    {:mode-fraction  (top-n-fraction counts total 1)
     :top-3-fraction (top-n-fraction counts total 3)})
  (invoke [this x]
    (set! total (inc total))
    (when-not (nil? x)
      ;; Key the frequency map on (hash x), not x itself: mode-fraction / top-3-fraction need only
      ;; value frequencies, never the values, and retaining raw values is high memory cost.
      (let [k (hash x)]
        (cond (contains? counts k)                        (set! counts (update counts k inc))
              (< (count counts) mode-stats-max-distinct)  (set! counts (assoc counts k 1)))))
    this))

(defn- mode-stats
  "Reducer that tracks value frequencies (bounded at `mode-stats-max-distinct` entries)
  and, on completion, returns {:mode-fraction, :top-3-fraction}. High mode-fraction
  signals single-value dominance; high top-3-fraction with moderate mode-fraction signals
  bimodal / few-real-categories distributions."
  ([] (->ModeStatsTracker {} 0))
  ([tracker] (tracker))
  ([tracker x] (tracker x)))

(deffingerprinter :type/DateTime
  ((map ->temporal)
   (redux/post-complete
    (robust-fuse {:earliest   earliest
                  :latest     latest
                  :mode-stats ((filter some?) mode-stats)})
    (fn [{:keys [mode-stats] :as fused}]
      (-> fused
          (dissoc :mode-stats)
          (assoc :mode-fraction  (:mode-fraction mode-stats)
                 :top-3-fraction (:top-3-fraction mode-stats)))))))

(deftype ^:private DistributionHolder [^SummaryStatistics summary, ^KllDoublesSketch kll])

(defn- distribution
  "Transducer that summarizes numerical data with SummaryStatistics and KllDoublesSketch."
  ([] (DistributionHolder. (SummaryStatistics.) (KllDoublesSketch/newHeapInstance)))
  ([^DistributionHolder holder] holder)
  ([^DistributionHolder holder x]
   (let [d (double x)]
     (.addValue ^SummaryStatistics (.summary holder) d)
     (.update ^KllDoublesSketch (.kll holder) d)
     holder)))

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
    (redux/juxt distribution stats/skewness stats/kurtosis mode-stats (stats/share zero?)))
   (fn [[^DistributionHolder h, sk ku ms zf]]
     (let [^SummaryStatistics summary (.summary h)
           ^KllDoublesSketch kll      (.kll h)
           n                          (.getN summary)]
       (robust-map
        :min             (.getMinItem kll)
        :max             (.getMaxItem kll)
        ;; Ensure we don't get ##NaN in avg/sd
        :avg             (when (pos? n) (.getMean summary))
        :sd              (when (pos? n) (math/sqrt (.getVariance summary)))
        :q1              (.getQuantile kll 0.25)
        :q3              (.getQuantile kll 0.75)
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
                  :percent-blank  (stats/share str/blank?)
                  :average-length ((map count) stats/mean)
                  :mode-stats     mode-stats})
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
