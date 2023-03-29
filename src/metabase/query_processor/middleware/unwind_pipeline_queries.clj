(ns metabase.query-processor.middleware.unwind-pipeline-queries
  "Unwind pMBQL pipeline queries."
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn- unwind-pipeline-queries* [query]
  (let [query-type (some-> ((some-fn #(get % :type) #(get % "type")) query)
                           keyword)]
    (if-not (= query-type :pipeline)
      query
      (do
        (log/debugf "Converting pMBQL query:\n%s" (u/pprint-to-str query))
        (let [normalized (lib.normalize/normalize query)]
          (when-not (= query normalized)
            (log/debugf "Normalized:\n%s" (u/pprint-to-str normalized)))
          (let [converted (lib.convert/->legacy-MBQL normalized)]
            (log/debugf "Converted:\n%s" (u/pprint-to-str converted))
            converted))))))

(defn unwind-pipeline-queries
  "Convert new-style pMBQL queries as produced by MLv2 to legacy MBQL."
  [qp]
  (fn [query rff context]
    (qp (unwind-pipeline-queries* query) rff context)))
