(ns metabase-enterprise.metabot-v3.tools.create-question
  "Tool for creating questions/cards in Metabase from the AI service."
  (:require
   [metabase.api.common :as api]
   [metabase.queries.models.card :as card]
   [metabase.util.log :as log]))

(defn create-question
  "Create a new question/card in Metabase from the provided arguments."
  [{:keys [name description dataset-query display visualization-settings collection-id]
    :or {collection-id nil}}]
  (try
    (let [card-data {:name name
                    :description description
                    :dataset_query dataset-query
                    :display display
                    :visualization_settings visualization-settings
                    :collection_id collection-id
                    :creator_id api/*current-user-id*}  ; Use current user ID
          created-card (card/create-card! card-data @api/*current-user*)]
      {:success true
       :id (:id created-card)
       :message (format "Successfully created question '%s' with ID %d" (:name created-card) (:id created-card))})
    (catch Exception e
      (log/error e "Failed to create question")
      {:success false
       :id nil
       :message (format "Failed to create question: %s" (.getMessage e))})))