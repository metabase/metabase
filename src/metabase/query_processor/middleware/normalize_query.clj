(ns metabase.query-processor.middleware.normalize-query
  "Middleware that converts a query into a normalized, canonical form."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.error-type :as qp.error-type]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]))

(defn- normalize*
  [query]
  (let [metadata-provider (or (when-let [existing (:lib/metadata query)]
                                (when (lib.metadata.protocols/metadata-provider? existing)
                                  existing))
                              (qp.store/metadata-provider))]
    (lib/query metadata-provider query)))

(mu/defn normalize-preprocessing-middleware :- ::lib.schema/query
  "Preprocessing middleware. Normalize a query, meaning do things like convert keys and MBQL clause tags to kebab-case
  keywords. Convert query to MBQL 5 if needed."
  [query :- [:map [:database ::lib.schema.id/database]]]
  (try
    (normalize* query)
    (catch Throwable e
      (throw (ex-info (format "Error normalizing query: %s" (ex-message e))
                      {:type  qp.error-type/qp
                       :query query}
                      e)))))
