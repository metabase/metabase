(ns metabase.typed-schemas.schema.common
  "Shared typed-schema source helpers."
  (:require
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.db :as typed-schemas.db]))

(set! *warn-on-reflection* true)

(defn destination-db-ids
  "Returns the subset of `db-ids` that back a destination (routed) database.

  Destinations are routing internals reachable only through their router database, so typed-schema
  generation excludes anything backed by one -- the same rule Metabot's resource guard enforces (see
  `metabase.metabot.tools.resources/check-resource-database`)."
  [db-ids]
  (when (seq db-ids)
    (typed-schemas.db/destination-database-ids db-ids)))

(defn select-schema-cards
  "Returns readable, non-archived cards for schema generation.

  Metrics, models and saved questions are backed by cards. They need
  the same visibility, archived, database and collection filters, and exclude cards backed by a
  destination (routed) database -- see [[destination-db-ids]]."
  [card-type database-ids collection-ids]
  (let [cards (->> (typed-schemas.db/cards-ordered-by-name card-type database-ids collection-ids)
                   (filter mi/can-read?))
        destination-ids (destination-db-ids (into #{} (keep :database_id) cards))]
    (if (seq destination-ids)
      (remove #(contains? destination-ids (:database_id %)) cards)
      cards)))

(defn aggregation-result-column-with-metadata-provider
  "Returns an aggregation result column using an existing metadata provider."
  [metadata-provider query-definition]
  (try
    (let [query              (lib/query metadata-provider query-definition)
          aggregation-column (m/find-first #(= (:lib/source %) :source/aggregations)
                                           (lib/returned-columns query))]
      (when aggregation-column
        (metabot/->result-column query aggregation-column)))
    ;; Result-column inference is best effort; callers fall back to an unknown column.
    (catch Exception _
      nil)))

(defn aggregation-result-column
  "Returns the first aggregation result column for a saved query
   definition, for metrics and measures."
  [database-id query-definition]
  (try
    (aggregation-result-column-with-metadata-provider
     (lib-be/application-database-metadata-provider database-id)
     query-definition)
    ;; Result-column inference is best effort; callers fall back to an unknown column.
    (catch Exception _
      nil)))
