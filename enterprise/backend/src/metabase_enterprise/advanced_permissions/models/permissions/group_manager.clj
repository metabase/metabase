(ns metabase-enterprise.advanced-permissions.models.permissions.group-manager
  (:require [clojure.data :as data]
            [clojure.set :refer [subset?]]
            [metabase.api.common :as api]
            [metabase.models :refer [PermissionsGroupMembership]]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn user-group-memberships
  "Return a list of group memberships a User belongs to.
  Group Membership is a map with 2 keys [:id :is_group_manager]."
  [user-or-id]
  (when user-or-id
    (db/select [PermissionsGroupMembership [:group_id :id] :is_group_manager] :user_id (u/the-id user-or-id))))

(defn set-user-group-memberships!
  [user-or-id new-user-group-memberships]
  (let [user-id                    (u/the-id user-or-id)
        manager-of-groups-ids      (db/select-field :group_id PermissionsGroupMembership
                                                    :user_id api/*current-user-id* :is_group_manager true)
        old-user-group-memberships (user-group-memberships user-id)
        ;; convert form [{:id 1 :is_group_manager true}] -> {1 {:is_group_manager true}}
        old-group-id->group-info   (into {} (map (fn [x] [(:id x) (dissoc x :id)]) old-user-group-memberships))
        new-group-id->group-info   (into {} (map (fn [x] [(:id x) (dissoc x :id)]) new-user-group-memberships))
        [to-remove to-add]         (data/diff old-group-id->group-info new-group-id->group-info)
        to-remove-group-ids        (keys to-remove)
        to-add-group-ids           (keys to-add)]
    (when-not api/*is-superuser?*
      ;; prevent groups manager from update membership of groups that they're not manager of
      (api/check-403 (subset? (set (concat to-remove-group-ids to-add-group-ids)) manager-of-groups-ids)))
    (when (seq (concat to-remove to-add))
      (db/transaction
       (when (seq to-remove-group-ids)
         (db/delete! PermissionsGroupMembership :user_id user-id, :group_id [:in to-remove-group-ids]))
       (when (seq to-add-group-ids)
         ;; do multilple single insert because insert-many! does not call post-insert! hook
         (for [group-id to-add-group-ids]
           (db/insert! PermissionsGroupMembership
                       {:user_id          user-id
                        :group_id         group-id
                        :is_group_manager (:is_group_manager (new-group-id->group-info group-id))})))))))
