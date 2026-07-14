(ns metabase.typed-schemas.api.schema.common
  "Shared typed-schema card selection and detail helpers."
  (:require
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.scope :as scope]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn select-schema-cards
  "Returns readable, non-archived cards for schema generation.

  Question, model, and metric generation all start from cards and need the same
  visibility, archived, database, and collection filters. Keeping that selection
  in one place prevents each generator namespace from drifting on access rules."
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

(defn- schema-card-type-name
  [card]
  (some-> (:type card) name))

(defn- schema-details-error-message
  [card error-message]
  (format "Failed to build schema details for %s \"%s\" (card %s): %s"
          (or (schema-card-type-name card) "card")
          (or (:name card) "Untitled")
          (:id card)
          (or error-message "unknown error")))

(defn- schema-details-error-data
  [card error-data]
  (m/assoc-some
   {:card-id   (:id card)
    :card-name (:name card)
    :card-type (:type card)}
   :status-code (:status-code error-data)))

(defn question-details
  "Returns structured report details for a saved question or model card.

  The schema generators consume `entity-details` output instead of raw Card
  rows because it already resolves result columns and source metadata in the
  shape agents need. Models reuse this path because they are stored as cards and
  need the same detail/error behavior before action schemas are attached.

  Wraps entity-detail failures with schema-specific context so endpoint errors
  identify the card that failed to produce schema data."
  [card]
  (let [response (try
                   (entity-details/get-report-details {:report-id             (:id card)
                                                       :with-field-values?    false
                                                       :with-related-tables?  false
                                                       :with-metrics?         false
                                                       :with-measures?        false
                                                       :with-segments?        false})
                   (catch Exception exception
                     (throw (ex-info (schema-details-error-message card (ex-message exception))
                                     (assoc (schema-details-error-data card (ex-data exception))
                                            :cause-message (ex-message exception))
                                     exception))))]
    (or (:structured-output response)
        (let [error-message (:output response)]
          (throw (ex-info (schema-details-error-message card error-message)
                          (assoc (schema-details-error-data card response)
                                 :error-message error-message
                                 :response response)))))))

(defn aggregation-result-column
  "Returns the first aggregation result column for a saved query definition.

  Metrics and measures both need to expose the result type of an aggregation.
  Lib already knows how to compute returned columns from a query, so this helper
  keeps schema generation aligned with Lib instead of duplicating aggregation
  metadata logic in each generator namespace."
  [database-id query-definition]
  (try
    (let [metadata-provider  (lib-be/application-database-metadata-provider database-id)
          query              (lib/query metadata-provider query-definition)
          aggregation-column (m/find-first #(= (:lib/source %) :source/aggregations)
                                           (lib/returned-columns query))]
      (when aggregation-column
        (metabot.tools.u/->result-column query aggregation-column)))
    (catch Exception _
      nil)))
