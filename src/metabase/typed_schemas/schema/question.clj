(ns metabase.typed-schemas.schema.question
  "Typed schema generation for saved questions."
  (:require
   [medley.core :as m]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.typed-schemas.common :as common]
   [metabase.typed-schemas.schema.common :as schema.common]))

(set! *warn-on-reflection* true)

(defn- question-details-error-message
  [card error-message]
  (format "Failed to build schema details for question \"%s\" (card %s): %s"
          (or (:name card) "Untitled")
          (:id card)
          (or error-message "unknown error")))

(defn- question-details-error-data
  [card error-data]
  (m/assoc-some
   {:card-id   (:id card)
    :card-name (:name card)
    :card-type (:type card)}
   :status-code (:status-code error-data)))

(defn- question-details
  "Returns saved-question details in the selected-card order."
  [cards]
  (let [details-by-card-id (into {}
                                 (mapcat (fn [[database-id database-cards]]
                                           (mapv (fn [card details]
                                                   (try
                                                     [(:id card)
                                                      (assoc details
                                                             :result-columns (:fields details)
                                                             :display (:display card))]
                                                     (catch Exception exception
                                                       (throw (ex-info (question-details-error-message card (ex-message exception))
                                                                       (assoc (question-details-error-data card (ex-data exception))
                                                                              :cause-message (ex-message exception))
                                                                       exception)))))
                                                 database-cards
                                                 (entity-details/cards-details
                                                  :question database-id database-cards
                                                  {:with-field-values?    false
                                                   :with-related-tables?  false
                                                   :with-metrics?         false
                                                   :with-measures?        false
                                                   :with-segments?        false})))
                                         (group-by :database_id cards)))]
    (mapv details-by-card-id (map :id cards))))

(defn question-schema
  "Returns the schema for a saved question."
  [{:keys [id name description verified display result-columns portable_entity_id]}]
  (m/assoc-some
   {:type    "card"
    :key     (common/generated-key name id)
    :id      id
    :name    name
    :display display
    :columns (mapv common/column-schema result-columns)}
   :entityId portable_entity_id
   :description description
   :verified (when verified true)))

(defn question-schemas
  "Returns schemas for saved questions, with optional database and collection scopes."
  ([database-ids]
   (question-schemas database-ids nil))
  ([database-ids collection-ids]
   (let [cards (schema.common/select-schema-cards :question database-ids collection-ids)]
     (mapv question-schema (question-details cards)))))
