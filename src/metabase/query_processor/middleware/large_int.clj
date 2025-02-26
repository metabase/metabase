(ns metabase.query-processor.middleware.large-int
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.performance :as perf]))

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
  [n]
  (and (instance? Long n)
       (or (< n min-long) (> n max-long))))

(defn- large-bigint?
  "Checks if `n` is a `bigint` value outside the JS number range."
  [n]
  (and (instance? clojure.lang.BigInt n)
       (or (.lt n min-bigint)
           (.lt max-bigint n))))

(defn- large-biginteger?
  "Checks if `n` is `biginteger` value outside the JS number range."
  [n]
  (and (instance? java.math.BigInteger n)
       (or (> 0 (.compareTo n min-biginteger)) (< 0 (.compareTo n max-biginteger)))))

(defn- large-bigdecimal?
  "Checks if `n` is a `bigdecimal` value outside the JS number range and without the fractional part. We use `.scale` to
  find the location of the decimal point. For performance reasons, we do not call `stripTrailingZeros`
  to avoid memory allocation. Therefore, we will identify `10` as an integer, but not `10.0`."
  [n]
  (and (instance? java.math.BigDecimal n)
       (<= (.scale n) 0)
       (or (> 0 (.compareTo n min-bigdecimal)) (< 0 (.compareTo n max-bigdecimal)))))

(defn- large-integer?
  "Checks if `n` is a large integer outside the JS number range."
  [n]
  (or (large-long? n)
      (large-bigint? n)
      (large-biginteger? n)
      (large-bigdecimal? n)))

(defn- large-int->string [x]
  "Converts large integer values to strings and leaves other values unchanged."
  (if (large-integer? x)
    (str x)
    x))

(defn- result-large-int->string
  "Converts all large integer row values to strings."
  [column-index-mask rf]
  ((map (fn [row]
          (perf/mapv #(if %2 (large-int->string %1) %1) row column-index-mask)))
   rf))

(defn- maybe-integer-column?
  "Checks if the column might have large interger values."
  [{:keys [base_type] :as _column-metadata}]
  (or (isa? base_type :type/Integer)
      (isa? base_type :type/Decimal)))

(defn- column-index-mask
  "Returns a mask of booleans for each column. If the mask for the column is true, it might be converted to string. Done
  for performance reasons to avoid checking every row value."
  [cols]
  (mapv maybe-integer-column? cols))

(defn convert-large-int-to-string
  "Converts any large integer in a result to a string to handle a number > 2^51 or < -2^51, the JavaScript float
  mantissa. This will allow proper display of large integers, like IDs from services like social media."
  [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware} rff]
  (let [rff' (when js-int-to-string?
               (fn [metadata]
                 (let [mask (column-index-mask (:cols metadata))]
                   (qp.store/store-miscellaneous-value! [::column-index-mask] mask)
                   (result-large-int->string mask (rff metadata)))))]
    (or rff' rff)))
