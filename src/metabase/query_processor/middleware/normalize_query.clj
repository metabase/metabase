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

(defn- normalize* [query]
  (try
    (let [query-type (keyword ((some-fn :type #(get % "type")) query))
          normalized (case query-type
                       :pipeline
                       (lib.convert/->legacy-MBQL (lib/normalize query))

                       (:query :native)
                       (mbql.normalize/normalize query))]
      (log/tracef "Normalized query:\n%s\n=>\n%s" (u/pprint-to-str query) (u/pprint-to-str normalized))
      normalized)
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
