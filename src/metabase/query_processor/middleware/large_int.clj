(ns metabase.query-processor.middleware.large-int
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.performance :as perf]))

(def ^:private min-long -9007199254740991)
(def ^:private max-long 9007199254740991)
(def ^:private min-bigint (bigint min-long))
(def ^:private max-bigint (bigint max-long))
(def ^:private min-biginteger (biginteger min-long))
(def ^:private max-biginteger (biginteger max-long))
(def ^:private min-bigdecimal (bigdec min-long))
(def ^:private max-bigdecimal (bigdec max-long))

(defn- large-long?
  [n]
  (and (instance? Long n)
       (or (< n min-long) (> n max-long))))

(defn- large-bigint?
  [n]
  (and (instance? clojure.lang.BigInt n)
       (or (< n min-bigint) (> n max-bigint))))

(defn- large-biginteger?
  [n]
  (and (instance? java.math.BigInteger n)
       (or (< n min-biginteger) (> n max-biginteger))))

(defn- large-bigdecimal?
  [n]
  (and (instance? java.math.BigDecimal n)
       (or (< n min-bigdecimal) (> n max-bigdecimal))))

(defn- large-integer?
  [n]
  (or (large-long? n)
      (large-bigint? n)
      (large-biginteger? n)
      (large-bigdecimal? n)))

(defn- large-int->string [x]
  (if (large-integer? x)
    (str x)
    x))

(defn- result-large-int->string
  [field-mask rf]
  ((map (fn [row]
          (perf/mapv #(if %2 (large-int->string %1) %1) row field-mask)))
   rf))

(defn- maybe-integer-column?
  [{:keys [base_type] :as _column-metadata}]
  (or (isa? base_type :type/Integer)
      (isa? base_type :type/Decimal)))

(defn- column-index-mask
  [cols]
  (mapv maybe-integer-column? cols))

(defn convert-large-int-to-string
  "Converts any large integer in a result to a string to handle a number > 2^51 or < -2^51, the JavaScript float
  mantissa. This will allow proper display of large integers, like IDs from services like social media. NULLs are
  converted to Clojure nil/JS null."
  [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as query} rff]
  (let [rff' (when js-int-to-string?
               (fn [metadata]
                 (let [mask (column-index-mask (:cols metadata))]
                   (qp.store/store-miscellaneous-value! [::column-index-mask] mask)
                   (result-large-int->string mask (rff metadata)))))]
    (or rff' rff)))
