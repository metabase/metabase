(ns metabase.query-processor.middleware.large-int
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.performance :as perf]))

(defn- integer-column?
  [{:keys [base_type] :as _column-metadata}]
  (isa? base_type :type/Integer))

(defn- column-index-mask
  [cols]
  (mapv integer-column? cols))

(defn- large-long?
  [^Long n]
  (or (< n -9007199254740991)
      (> n 9007199254740991)))

(defn- large-integer?
  [n]
  (and (instance? Long n) (large-long? n)))

(defn- large-int->string [x]
  (if (large-integer? x)
    (str x)
    x))

(defn- result-large-int->string
  [field-mask rf]
  ((map (fn [row]
          (perf/mapv #(if %2 (large-int->string %1) %1) row field-mask)))
   rf))

(defn convert-large-int-to-string
  "Converts any big integer in a result to a string to handle a number > 2^51 or < -2^51, the JavaScript float mantissa.
  This will allow proper display of large integers, like IDs from services like social media. NULLs are converted to
  Clojure nil/JS null."
  [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as query} rff]
  (let [rff' (when js-int-to-string?
               (fn [metadata]
                 (let [mask (column-index-mask (:cols metadata))]
                   (qp.store/store-miscellaneous-value! [::column-index-mask] mask)
                   (result-large-int->string mask (rff metadata)))))]
    (or rff' rff)))
