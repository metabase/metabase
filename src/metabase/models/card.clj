(ns metabase.models.card
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [*current-user-id* org-perms-case]]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [realize-json]]
                             [org :refer [Org]]
                             [user :refer [User]])))

(defentity Card
  (table :report_card))

(defn card-permissions
  "Return a set of permissions for CARD. Possible permissions are `:read` and `:write`."
  [card]
  ((:public_perms card) {0 #{}
                         1 #{:read}
                         2 #{:read :write}}))

(defn card-can-read [card]
  (or (= (:creator_id card) *current-user-id*)
      (org-perms-case (:organization_id card)
        :admin true
        :default (contains? @(:permissions-set card) :read)
        :nil false)))

(defn card-can-write [card]
  (or (= (:creator_id card) *current-user-id*)
      (org-perms-case (:organization_id card)
        :admin true
        :default (contains? @(:permissions-set card) :write)
        :nil false)))

(defmethod post-select Card [_ {:keys [organization_id creator_id] :as card}]
  (-> card
      (realize-json :dataset_query :visualization_settings)
      (assoc :can_read (delay (card-can-read card))
             :can_write (delay (card-can-write card))
             :permissions-set (delay (card-permissions card))
             :creator (sel-fn :one User :id creator_id)
             :organization (sel-fn :one Org :id organization_id))))
