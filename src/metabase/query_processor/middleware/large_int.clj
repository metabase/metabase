(ns metabase.query-processor.middleware.large-int
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.performance :as perf]))

(defn- large-int-column?
  [{:keys [base-type] :as _column-metadata}]
  (isa? base-type :type/BigInteger))

(defn- column-index-mask
  "Return a mask of booleans for each column. If the mask for the column is true, it could be converted to string."
  [cols]
  (let [mask (mapv large-int-column? cols)]
    (when (some true? mask)
      mask)))

(defn- large-int->string [x]
  (when x
    (str x)))

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
               (when-let [mask (column-index-mask (:fields (:query query)))]
                 (fn [metadata]
                   (let [mask (column-index-mask (:fields (:query query)))]
                     (qp.store/store-miscellaneous-value! [::column-index-mask] mask)
                     (result-large-int->string mask (rff metadata))))))]
    (or rff' rff)))
