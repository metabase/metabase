(ns metabase.query-processor.middleware.prefetch-metadata
  "Middleware that bulk-loads all the metadata referenced by a query into the metadata provider's cache up front, so
  that later middleware and SQL compilation hit the cache instead of fetching objects from the app DB one at a time."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]))

(defn prefetch-metadata
  "Bulk-load the metadata for everything referenced by `query` -- tables, cards, metrics, measures, segments,
  snippets, and the fields referenced by template tags or implicit joins -- into the metadata provider's cache using a
  constant number of app-DB calls. Runs right after source cards are resolved, so card queries are already part of
  the `query`."
  [query]
  (let [metadata-provider (qp.store/metadata-provider)]
    (when (lib.metadata.protocols/cached-metadata-provider-with-cache? metadata-provider)
      (lib-be/bulk-load-query-metadata! metadata-provider (lib/all-referenced-entity-ids [query]))))
  query)
