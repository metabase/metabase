(ns metabase.query-processor.middleware.normalize-query
  "Middleware that converts a query into a normalized, canonical form."
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn normalize-without-convering
  "Normalize either a pMBQL or legacy MBQL query without converting it to legacy."
  [query]
  (let [query-type (keyword (some #(get query %) [:lib/type "lib/type" :type "type"]))
        f          (case query-type
                     :mbql/query      lib/normalize
                     (:query :native) mbql.normalize/normalize)]
    (f query)))

(defn- normalize* [query]
  (try
    (let [normalized   (normalize-without-convering query)
          legacy-query (case ((some-fn :lib/type :type) normalized)
                         :mbql/query      (lib.convert/->legacy-MBQL normalized)
                         (:query :native) normalized)]
      (log/tracef "Normalized query:\n%s\n=>\n%s" (u/pprint-to-str query) (u/pprint-to-str legacy-query))
      legacy-query)
    (catch Throwable e
      (throw (ex-info (.getMessage e)
                      {:type  qp.error-type/qp
                       :query query}
                      e)))))

(defn normalize
  "Middleware that converts a query into a normalized, canonical form, including things like converting all identifiers
  into standard `lisp-case` ones, removing/rewriting legacy clauses, removing empty ones, etc. This is done to
  simplifiy the logic in the QP steps following this."
  [qp]
  (fn [query rff context]
    (qp (normalize* query) rff context)))
