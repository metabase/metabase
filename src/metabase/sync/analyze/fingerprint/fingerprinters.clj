(ns metabase.sync.analyze.fingerprint.fingerprinters
  "Non-identifying fingerprinters for various field types."
  (:require [cheshire.core :as json]
            [clj-time.coerce :as t.coerce]
            [kixi.stats.core :as stats]
            [metabase.sync.util :as sync-util]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [puppetlabs.i18n.core :as i18n :refer [trs]]
            [redux.core :as redux])
  (:import com.clearspring.analytics.stream.cardinality.HyperLogLogPlus))

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

(defmulti
  ^{:doc "Return a fingerprinter transducer for a given field based on the field's type."
    :arglists '([field])}
  fingerprinter (juxt :base_type (some-fn :special_type (constantly :type/*))))

(def ^:private global-fingerprinter
  (redux/post-complete
   (redux/fuse {:distinct-count cardinality})
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

(defn- with-global-fingerprinter
  [fingerprinter]
  (redux/post-complete
   (redux/juxt
    fingerprinter
    global-fingerprinter)
   (fn [[type-fingerprint global-fingerprint]]
     (merge global-fingerprint
            type-fingerprint))))

(defmacro ^:private with-reduced-error
  [msg & body]
  `(let [result# (sync-util/with-error-handling ~msg ~@body)]
     (if (instance? Throwable result#)
       (reduced result#)
       result#)))

(defn- with-error-handling
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

(defn- earliest
  ([] (java.util.Date. Long/MAX_VALUE))
  ([acc] (du/date->iso-8601 acc))
  ([^java.util.Date acc dt]
   (if dt
     (if (.before ^java.util.Date dt acc)
       dt
       acc)
     acc)))

(defn- latest
  ([] (java.util.Date. 0))
  ([acc] (du/date->iso-8601 acc))
  ([^java.util.Date acc dt]
   (if dt
     (if (.after ^java.util.Date dt acc)
       dt
       acc)
     acc)))

(deffingerprinter :type/DateTime
  ((map (fn [dt]
          (if (string? dt)
            (-> dt du/str->date-time t.coerce/to-date-time)
            dt)))
   (redux/fuse {:earliest earliest
                :latest   latest})))

(deffingerprinter :type/Number
  (redux/fuse {:min stats/min
               :max stats/max
               :avg stats/mean}))

(defn- valid-serialized-json?
  "Is x a serialized JSON dictionary or array."
  [x]
  (u/ignore-exceptions
    ((some-fn map? sequential?) (json/parse-string x))))

(deffingerprinter :type/Text
  ((map (comp str u/jdbc-clob->str)) ; we cast to str to support `field-literal` type overwriting:
                                     ; `[:field-literal "A_NUMBER" :type/Text]` (which still
                                     ; returns numbers in the result set)
   (redux/fuse {:percent-json   (stats/share valid-serialized-json?)
                :percent-url    (stats/share u/url?)
                :percent-email  (stats/share u/email?)
                :average-length ((map count) stats/mean)})))

(defn fingerprint-fields
  "Return a transducer for fingerprinting a resultset with fields `fields`."
  [fields]
  (apply col-wise (map fingerprinter fields)))
