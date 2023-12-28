(ns metabase-enterprise.advanced-permissions.models.permissions.group-manager
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.models :refer [PermissionsGroupMembership]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn user-group-memberships
  "Return a list of group memberships a User belongs to.
  Group Membership is a map with 2 keys [:id :is_group_manager]."
  [user-or-id]
  (when user-or-id
    (t2/select [PermissionsGroupMembership [:group_id :id] :is_group_manager] :user_id (u/the-id user-or-id))))

(defn- user-group-memberships->map
  "Transform user-group-memberships to a map in which keys are group-ids and values are maps containing membership info.

  [{:id 1, :is_group_manager true}] => {1 {:is_group_manager true}}

  We can diff this map to decide which membership to add/remove."
  [user-group-memberships]
  (into {} (map (fn [x] [(:id x) (dissoc x :id)]) user-group-memberships)))

(defn set-user-group-memberships!
  "Update Groups Memberships of a User when `advanced-permissions` is enabled.
  It can be used to adds/removes a user from groups and promote/demote Group Manager."
  [user-or-id new-user-group-memberships]
  (let [user-id                       (u/the-id user-or-id)
        old-user-group-memberships    (user-group-memberships user-id)
        old-group-id->membership-info (user-group-memberships->map old-user-group-memberships)
        new-group-id->membership-info (user-group-memberships->map new-user-group-memberships)
        [to-remove to-add]            (data/diff old-group-id->membership-info new-group-id->membership-info)
        to-remove-group-ids           (keys to-remove)
        to-add-group-ids              (keys to-add)]
    ;; TODO: Should do this check in the API layer
    (when-not api/*is-superuser?*
      ;; prevent groups manager from update membership of groups that they're not manager of
      (when-not (and api/*is-group-manager?*
                     (set/subset? (set (concat to-remove-group-ids to-add-group-ids))
                                  (t2/select-fn-set :group_id PermissionsGroupMembership
                                                    :user_id api/*current-user-id* :is_group_manager true)))
        (throw (ex-info (tru "Not allowed to edit group memberships")
                        {:status-code 403}))))
    (t2/with-transaction [_conn]
     (when (seq to-remove-group-ids)
       (t2/delete! PermissionsGroupMembership :user_id user-id, :group_id [:in to-remove-group-ids]))
     (when (seq to-add-group-ids)
       ;; do multiple single inserts because insert-many! does not call post-insert! hook
       (doseq [group-id to-add-group-ids]
         (t2/insert! PermissionsGroupMembership
                     {:user_id          user-id
                      :group_id         group-id
                      :is_group_manager (:is_group_manager (new-group-id->membership-info group-id))}))))))
