(ns metabase.models.card
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [realize-json]]
                             [org :refer [Org]]
                             [user :refer [User]])))

(defentity Card
  (table :report_card))

(defmethod post-select Card [_ {:keys [organization_id creator_id] :as card}]
  (-> card
      (realize-json :dataset_query :visualization_settings)
      (assoc :organization (sel-fn :one Org :id organization_id)
             :creator (sel-fn :one User :id creator_id))))
