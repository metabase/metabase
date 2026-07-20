(ns metabase.typed-schemas.api.schema.common
  "Shared typed-schema source helpers."
  (:require
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.scope :as scope]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn select-schema-cards
  "Returns readable, non-archived cards for schema generation.

  Metrics, models and saved questions are backed by cards. They need
  the same visibility, archived, database and collection filters."
  ([card-type database-ids]
   (select-schema-cards card-type database-ids nil))
  ([card-type database-ids collection-ids]
   (->> (t2/select :model/Card
                   {:where    (cond-> [:and
                                       [:= :type (name card-type)]
                                       [:= :archived false]
                                       (collection/visible-collection-filter-clause :collection_id)]
                                database-ids (conj (scope/database-id-filter-clause database-ids :database_id))
                                collection-ids (conj (scope/id-filter-clause collection-ids :collection_id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

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
