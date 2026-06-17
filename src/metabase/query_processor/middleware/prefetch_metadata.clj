(ns metabase.query-processor.middleware.prefetch-metadata
  "Middleware that bulk-loads all the metadata referenced by a query into the metadata provider's cache up front, so
  that later middleware and SQL compilation hit the cache instead of fetching objects from the app DB one at a time."
  (:require
   [clojure.set :as set]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.log :as log]))

(defn- card->referenced-entity-ids
  [metadata-provider card]
  (try
    (when (seq (:dataset-query card))
      (lib/all-referenced-entity-ids [(lib/card->underlying-query metadata-provider card)]))
    (catch Throwable e
      ;; prefetching is an optimization: a Card we cannot make sense of here will be dealt with when it is resolved
      (log/debugf e "Error getting referenced entity ids for Card %s" (:id card)))))

(defn- all-referenced-entity-ids
  "Collect the ids of all the entities referenced by `query`, following Card references (source cards and
  `{{#card-id}}` template tags) recursively: the referenced Cards are fetched level by level, one bulk call per level
  of nesting, and the entities their queries reference are folded into the result."
  [metadata-provider query]
  (loop [referenced-ids (lib/all-referenced-entity-ids [query])
         seen-card-ids  #{}]
    (let [new-card-ids (set/difference (:card referenced-ids) seen-card-ids)]
      (if (seq new-card-ids)
        (recur (transduce (keep #(card->referenced-entity-ids metadata-provider %))
                          (partial merge-with set/union)
                          referenced-ids
                          (lib.metadata/bulk-metadata metadata-provider :metadata/card new-card-ids))
               (into seen-card-ids new-card-ids))
        referenced-ids))))

(defn prefetch-metadata
  "Bulk-load the metadata for everything referenced by `query` -- tables, cards (recursively), metrics, measures,
  segments, snippets, and the fields referenced by template tags or implicit joins -- into the metadata provider's
  cache using a constant number of app-DB calls per level of Card nesting. Runs before source cards are resolved, so
  that resolving them hits the cache."
  [query]
  (let [metadata-provider (lib.metadata/->metadata-provider query)]
    (when (lib.metadata.protocols/cached-metadata-provider-with-cache? metadata-provider)
      (lib-be/bulk-load-query-metadata! metadata-provider (all-referenced-entity-ids metadata-provider query))))
  query)
