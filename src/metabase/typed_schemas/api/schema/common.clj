(ns metabase.typed-schemas.api.schema.common
  "Shared helpers for typed-schema schema construction."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.common :as typed-schemas.common]
   [metabase.typed-schemas.api.query-params :as qp]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn select-cards
  "Returns readable, visible cards of `card-type`, optionally scoped by database and collection ids."
  ([card-type database-ids]
   (select-cards card-type database-ids nil))
  ([card-type database-ids collection-ids]
   (->> (t2/select :model/Card
                   {:where    (cond-> [:and
                                       [:= :type (name card-type)]
                                       [:= :archived false]
                                       (collection/visible-collection-filter-clause :collection_id)]
                                database-ids (conj (qp/database-id-filter-clause database-ids :database_id))
                                collection-ids (conj (qp/id-filter-clause collection-ids :collection_id)))
                    :order-by [[:name :asc] [:id :asc]]})
        (filter mi/can-read?))))

(defn- card-type-name
  [card]
  (some-> (:type card) name))

(defn- schema-details-error-message
  [card error-message]
  (format "Failed to build schema details for %s \"%s\" (card %s): %s"
          (or (card-type-name card) "card")
          (or (:name card) "Untitled")
          (:id card)
          (or error-message "unknown error")))

(defn- schema-details-error-data
  [card m]
  (typed-schemas.common/assoc-some
   {:card-id   (:id card)
    :card-name (:name card)
    :card-type (:type card)}
   :status-code (:status-code m)))

(defn question-details
  "Returns structured output details for a saved question or model card, surfacing context-rich errors."
  [card]
  (let [response (try
                   (entity-details/get-report-details {:report-id             (:id card)
                                                       :with-field-values?    false
                                                       :with-related-tables?  false
                                                       :with-metrics?         false
                                                       :with-measures?        false
                                                       :with-segments?        false})
                   (catch Exception e
                     (throw (ex-info (schema-details-error-message card (ex-message e))
                                     (assoc (schema-details-error-data card (ex-data e))
                                            :cause-message (ex-message e))
                                     e))))]
    (or (:structured-output response)
        (let [error-message (:output response)]
          (throw (ex-info (schema-details-error-message card error-message)
                          (assoc (schema-details-error-data card response)
                                 :error-message error-message
                                 :response response)))))))

(defn fallback-metric-column
  "Returns a fallback unknown-typed result column for a metric-like entity."
  [{:keys [name]}]
  {:type          "column"
   :name          name
   :displayName   name
   :jsType        "unknown"})
