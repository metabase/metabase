(ns metabase.models.card
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [*current-user-id* org-perms-case]]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [realize-json]]
                             [org :refer [Org]]
                             [user :refer [User]])))

(defentity Card
  (table :report_card))

(defn- card-public-permissions
  "Return the set of public permissions for CARD. Possible permissions are `:read` and `:write`."
  [card]
  ({0 #{}
    1 #{:read}
    2 #{:read :write}} (:public_perms card)))

(defn- card-user-permissions
  "Return the set of current user's permissions for CARD."
  [card]
  (if (= (:creator_id card) *current-user-id*) #{:read :write} ; if user created CARD they have all permissions
      (org-perms-case (:organization_id card)
        nil #{}                                                ; if user has no permissions for CARD's Org then they have none for CARD
        :admin #{:read :write}                                 ; if user is an admin they have all permissions
        :default (card-public-permissions card))))             ; otherwise they have CARD's public permissions

(defn- card-can?
  "Check if *current-user* has a given PERMISSION for CARD.
   PERMISSION should be either `:read` or `:write`."
  [permission card]
  (contains? @(:user-permissions-set card) permission))

(defmethod post-select Card [_ {:keys [organization_id creator_id] :as card}]
  (-> card
      (realize-json :dataset_query :visualization_settings)
      (assoc :public-permissions-set (delay (card-public-permissions card))
             :user-permissions-set (delay (card-user-permissions card))
             :creator (sel-fn :one User :id creator_id)
             :organization (sel-fn :one Org :id organization_id))
      (#(assoc %
               :can_read (delay (card-can? :read %))           ; these need to happen after `:user-permissions-set` is set because `card-can?` depends on it
               :can_write (delay (card-can? :write %))))))
