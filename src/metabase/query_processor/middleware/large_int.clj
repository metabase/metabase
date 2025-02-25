(ns metabase.query-processor.middleware.large-int
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.performance :as perf]))

(defn- large-int? [x]
  (and (or (instance? Long x)
           (instance? clojure.lang.BigInt x)
           (instance? java.math.BigDecimal x)
           (instance? java.math.BigInteger x))
       (or (> x 9007199254740991) (< x -9007199254740991))))

(defn- result-large-int->string
  [rf]
  ((map (fn [row]
          (perf/mapv #(if (large-int? %) (str %) %1) row)))
   rf))

(defn convert-large-int-to-string
  "Converts any integer that cannot be represted as JS number (> 2^51 or < -2^51) to a string. This will allow proper
  display of large numbers, like IDs from services like social media. NULLs are converted to Clojure nil/JS null."
  [{{:keys [js-int-to-string?] :or {js-int-to-string? false}} :middleware, :as query} rff]
  (let [rff' (when js-int-to-string?
               (fn [metadata]
                 (result-large-int->string (rff metadata))))]
    (or rff' rff)))
