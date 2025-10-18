(ns metabase-enterprise.metabot-v3.tools.get-card-details
  "Tool for fetching raw app database details for cards/questions."
  (:require
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(defn get-cards-details
  "Get the raw app database details for a list of cards by their IDs.

  Arguments:
  - card-ids: A sequential collection of integer card IDs

  Returns a map with either:
  - {:structured-output {:cards [...]}} on success
  - {:output <error-message>} on error"
  [{:keys [card-ids]}]
  (if (and (sequential? card-ids) (seq card-ids) (every? int? card-ids))
    (let [cards (t2/select :model/Card :id [:in card-ids])
          ;; Filter cards based on read permissions
          readable-cards (filterv (fn [card]
                                    (try
                                      (api/read-check card)
                                      true
                                      (catch Exception _
                                        false)))
                                  cards)]
      {:structured-output {:cards readable-cards}})
    {:output "invalid card_ids - must be a non-empty list of integers"}))
