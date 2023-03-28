(ns metabase.query-processor.middleware.unwind-pipeline-queries
  "Unwind pMBQL pipeline queries."
  (:require
   [metabase.lib.convert :as lib.convert]))

(defn- unwind-pipeline-queries* [query]
  (println "query:" query) ; NOCOMMIT
  (let [query-type (some-> ((some-fn #(get % :type) #(get % "type")) query)
                           keyword)]
    (println "query-type:" query-type) ; NOCOMMIT
    (if (= query-type :pipleine)
      (lib.convert/->legacy-MBQL query)
      query)))

(defn unwind-pipeline-queries
  "Convert new-style pMBQL queries as produced by MLv2 to legacy MBQL."
  [qp]
  (fn [query rff context]
    (qp (unwind-pipeline-queries* query) rff context)))
