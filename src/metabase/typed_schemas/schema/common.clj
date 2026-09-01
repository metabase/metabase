(ns metabase.typed-schemas.schema.common
  "Shared typed-schema source helpers."
  (:require
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn scope-filter-clause
  "Compiles a resolved scope (see [[metabase.typed-schemas.scope]]) into a
  Honey SQL where-clause conjunct: a nil scope means unscoped (no clause), an
  empty scope matches nothing.

  This is the one place the nil-vs-empty semantics of scopes are enforced when
  querying. Do not replace call sites with `(seq ...)` guards — that would
  turn \"resolved to nothing\" into \"unscoped\" and select everything.
  Compiling the empty scope to an always-false clause (rather than skipping
  the query) keeps queries with several scope filters composable."
  [scope-ids column]
  (when scope-ids
    (if (seq scope-ids)
      [:in column scope-ids]
      ;; no row has id -1: a resolved-but-empty scope matches no rows
      [:= column -1])))

(defn destination-db-ids
  "Returns the subset of `db-ids` that back a destination (routed) database.

  Destinations are routing internals reachable only through their router database, so typed-schema
  generation excludes anything backed by one -- the same rule Metabot's resource guard enforces (see
  `metabase.metabot.tools.resources/check-resource-database`)."
  [db-ids]
  (when (seq db-ids)
    (t2/select-fn-set :id :model/Database 'id ['in db-ids] 'router_database_id ['not= nil])))

(defn select-schema-cards
  "Returns readable, non-archived cards for schema generation.

  Metrics, models and saved questions are backed by cards. They need
  the same visibility, archived, database and collection filters, and exclude cards backed by a
  destination (routed) database -- see [[destination-db-ids]]."
  [card-type database-ids collection-ids]
  (let [cards (->> (t2/select :model/Card
                              {:where    (cond-> [:and
                                                  [:= :type (name card-type)]
                                                  [:= :archived false]
                                                  (collection/visible-collection-filter-clause :collection_id)]
                                           database-ids (conj (scope-filter-clause database-ids :database_id))
                                           collection-ids (conj (scope-filter-clause collection-ids :collection_id)))
                               :order-by [[:name :asc] [:id :asc]]})
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
