(ns metabase.query-processor.middleware.large-int
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:refer-clojure :exclude [mapv])
  (:require
   [metabase.util.performance :refer [mapv-maybe-unchanged]])
  (:import
   (clojure.lang BigInt)
   (java.math BigDecimal BigInteger)))

(set! *warn-on-reflection* true)

;; Min and max integers that can be used in JS without precision loss as in JS they are stored as `double`.
;; There is a value for each type to avoid runtime memory allocation.
(def ^:private min-long -9007199254740991)
(def ^:private max-long 9007199254740991)
(def ^:private min-bigint (bigint min-long))
(def ^:private max-bigint (bigint max-long))
(def ^:private min-biginteger (biginteger min-long))
(def ^:private max-biginteger (biginteger max-long))
(def ^:private min-bigdecimal (bigdec min-long))
(def ^:private max-bigdecimal (bigdec max-long))

(defn- large-long?
  "Checks if `n` is a `long` value outside the JS number range."
  [^Long n]
  (or (< n min-long) (> n max-long)))

(defn- large-bigint?
  "Checks if `n` is a `bigint` value outside the JS number range."
  [^BigInt n]
  (or (< n min-bigint) (> n max-bigint)))

(defn- large-biginteger?
  "Checks if `n` is a `biginteger` value outside the JS number range."
  [^BigInteger n]
  (or (< n min-biginteger) (> n max-biginteger)))

(defn- large-bigdecimal?
  "Checks if `n` is a `bigdecimal` value outside the JS number range and without the fractional part. For performance
  reasons, we do not check if `n` has a fractional part."
  [^BigDecimal n]
  (or (< n min-bigdecimal) (> n max-bigdecimal)))

(defn- large-integer?
  "Checks if `n` is a large integer outside the JS number range."
  [n]
  (when (instance? Number n)
    (cond (instance? Long n) (large-long? n)
          (instance? BigInt n) (large-bigint? n)
          (instance? BigInteger n) (large-biginteger? n)
          (instance? BigDecimal n) (large-bigdecimal? n))))

(defn maybe-large-int->string
  "Converts large integer values to strings and leaves other values unchanged."
  [x]
  (if (large-integer? x)
    (str x)
    x))

(defn- result-large-int->string
  "Converts all large integer row values to strings."
  [rf]
  ((map (fn [row]
          (mapv-maybe-unchanged maybe-large-int->string row)))
   rf))

(defn convert-large-int-to-string
  "Converts any large integer in a result to a string to handle a number > 2^51 or < -2^51, the JavaScript float
  mantissa. This will allow proper display of large integers, like IDs from services like social media."
  [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as _query} rff]
  (let [rff' (when js-int-to-string?
               (fn [metadata]
                 (result-large-int->string (rff metadata))))]
    (or rff' rff)))
