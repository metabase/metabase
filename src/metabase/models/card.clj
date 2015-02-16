(ns metabase.models.card
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [*current-user-id* org-perms-case]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [hydrate :refer [realize-json]]
                             [org :refer [Org]]
                             [user :refer [User]])))

(defentity Card
  (table :report_card))

             ; otherwise they have CARD's public permissions



(defmethod post-select Card [_ {:keys [organization_id creator_id] :as card}]
  (-> card
      (realize-json :dataset_query :visualization_settings)
      (assoc :creator (sel-fn :one User :id creator_id)
             :organization (sel-fn :one Org :id organization_id))
      assoc-permissions-sets))
