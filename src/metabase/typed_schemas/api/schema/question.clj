(ns metabase.typed-schemas.api.schema.question
  "Saved-question typed-schema generation."
  (:require
   [medley.core :as m]
   [metabase.typed-schemas.api.common :as common]
   [metabase.typed-schemas.api.schema.common :as schema.common]))

(set! *warn-on-reflection* true)

(defn question-schema
  "Returns the typed-schema representation for a saved question.

  Saved questions are read sources for the SDK query DSL, so they keep runtime
  identifiers and result columns but leave action/model concerns to later
  generator namespaces."
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
  "Returns saved-question schemas for optional database and collection scopes.

  This stays separate from the API namespace so endpoint branches can compose
  question, table, model, and metric sections without owning the details of how
  each section is selected or rendered."
  ([database-ids]
   (question-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (schema.common/select-schema-cards :question database-ids collection-ids)
         :let [details (schema.common/question-details card)]
         :when details]
     (question-schema details))))
