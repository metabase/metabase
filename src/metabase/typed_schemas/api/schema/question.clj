(ns metabase.typed-schemas.api.schema.question
  "Question schema construction for typed-schema endpoints."
  (:require
   [metabase.typed-schemas.api.common :as typed-schemas.common]
   [metabase.typed-schemas.api.schema.common :as schema.common]))

(set! *warn-on-reflection* true)

(defn- question-schema
  [{:keys [id name description verified display result-columns portable_entity_id]}]
  (typed-schemas.common/assoc-some
   {:type    "card"
    :key     (typed-schemas.common/generated-key name id)
    :id      id
    :name    name
    :display display
    :columns (mapv typed-schemas.common/column-schema result-columns)}
   :entityId portable_entity_id
   :description description
   :verified (when verified true)))

(defn question-schemas
  "Returns question schemas for readable saved questions."
  ([database-ids]
   (question-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (schema.common/select-cards :question database-ids collection-ids)
         :let [details (schema.common/question-details card)]
         :when details]
     (question-schema details))))
