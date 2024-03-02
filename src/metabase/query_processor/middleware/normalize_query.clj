(ns metabase.query-processor.middleware.normalize-query
  "Middleware that converts a query into a normalized, canonical form."
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^:private normalize-audit-app-query :- [:map
                                                 [:type [:= :internal]]]
  [query :- :map]
  (-> query
      (update-keys keyword)
      (update :type keyword)))

(mu/defn normalize-preprocessing-middleware :- :map
  "Preprocessing middleware. Normalize a query, meaning do things like convert keys and MBQL clause tags to kebab-case
  keywords. Convert MLv2 pMBQL queries to legacy (temporary, until the QP is updated to process MLv2 directly)."
  [query :- :map]
  (try
    (let [query-type (keyword (some #(get query %) [:lib/type "lib/type" :type "type"]))
          normalized (case query-type
                       :mbql/query      ; pMBQL pipeline query
                       (lib.convert/->legacy-MBQL (lib/normalize query))

                       (:query :native)
                       (mbql.normalize/normalize query)

                       :internal
                       (normalize-audit-app-query query)

                       #_else
                       (throw (ex-info (i18n/tru "Invalid query, missing query :type or :lib/type")
                                       {:query query, :type qp.error-type/invalid-query})))]
      (log/tracef "Normalized query:\n%s\n=>\n%s" (u/pprint-to-str query) (u/pprint-to-str normalized))
      normalized)
    (catch Throwable e
      (throw (ex-info (format "Error normalizing query: %s" (.getMessage e))
                      {:type  qp.error-type/qp
                       :query query}
                      e)))))

(defn normalize-around-middleware
  "Middleware that converts a query into a normalized, canonical form, including things like converting all identifiers
  into standard `lisp-case` ones, removing/rewriting legacy clauses, removing empty ones, etc. This is done to
  simplifiy the logic in the QP steps following this."
  [qp]
  (fn [query rff]
    (qp (normalize-preprocessing-middleware query) rff)))
