(ns metabase-enterprise.dependencies.native-validation
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]))

(defn- compile-query [metadata-provider query]
  (->> (lib/query metadata-provider query)
       lib/add-parameters-for-template-tags
       (qp/compile-query-with-metadata-provider metadata-provider)
       :query))

(defn validate-native-query
  "Compiles a (native) query and validates that the fields and tables it refers to really exist.

   Returns either nil or a list of errors."
  [driver metadata-provider query]
  (->> (compile-query metadata-provider query)
       (driver/validate-native-query-fields driver metadata-provider)))

(defn native-result-metadata
  "Compiles a (native) query and calculates its result metadata"
  [driver metadata-provider query]
  (->> (compile-query metadata-provider query)
       (driver/native-result-metadata driver metadata-provider)))

(defn native-query-deps
  "Returns the upstream dependencies of a native query, as a set of `{:kind id}` pairs."
  [driver metadata-provider query]
  (let [compiled (compile-query metadata-provider query)]
    (into (driver/native-query-deps driver compiled metadata-provider)
          (keep #(case (:type %)
                   "snippet" {:snippet (:snippet-id %)}
                   :snippet  {:snippet (:snippet-id %)}
                   "card"    {:card (:card-id %)}
                   :card     {:card (:card-id %)}
                   nil))
          (-> query :native :template-tags vals))))
