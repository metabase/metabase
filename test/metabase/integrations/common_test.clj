(ns metabase.integrations.common-test
  (:require [expectations :refer [expect]]
            [metabase.integrations.common :as integrations.common]
            [metabase.models
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [user :refer [User]]]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- group-memberships
  "Return set of names of PermissionsGroups `user` currently belongs to."
  [user]
  (when-let [group-ids (seq (db/select-field :group_id PermissionsGroupMembership :user_id (u/get-id user)))]
    (db/select-field :name PermissionsGroup :id [:in group-ids])))

(defn- do-with-user-in-groups
  ([f groups-or-ids]
   (tt/with-temp User [user]
     (do-with-user-in-groups f user groups-or-ids)))
  ([f user [group-or-id & more]]
   (if group-or-id
     (tt/with-temp PermissionsGroupMembership [_ {:group_id (u/get-id group-or-id), :user_id (u/get-id user)}]
       (do-with-user-in-groups f user more))
     (f user))))

(defmacro ^:private with-user-in-groups
  "Create a User (and optionally PermissionsGroups), add user to a set of groups, and execute `body`.

    ;; create a new User, add to existing group `some-group`, execute body`
    (with-user-in-groups [user [some-group]]
      ...)

    ;; create a Group, then create a new User and add to new Group, then execute body
    (with-user-in-groups [new-group {:name \"My New Group\"}
                          user      [new-group]]
      ...)"
  {:arglists '([[group-binding-and-definition-pairs* user-binding groups-to-put-user-in?] & body]), :style/indent 1}
  [[& bindings] & body]
  (if (> (count bindings) 2)
    (let [[group-binding group-definition & more] bindings]
      `(tt/with-temp PermissionsGroup [~group-binding ~group-definition]
         (with-user-in-groups ~more ~@body)))
    (let [[user-binding groups-or-ids-to-put-user-in] bindings]
      `(do-with-user-in-groups (fn [~user-binding] ~@body) ~groups-or-ids-to-put-user-in))))

;; does syncing group memberships leave existing memberships in place if nothing has changed?
(expect
  #{"All Users" ":metabase.integrations.common-test/group"}
  (with-user-in-groups [group {:name (str ::group)}
                        user  [group]]
    (integrations.common/sync-group-memberships! user #{group})
    (group-memberships user)))

;; the actual `PermissionsGroupMembership` object should not have been replaced
(expect
  (with-user-in-groups [group {:name (str ::group)}
                        user  [group]]
    (let [membership-id          #(db/select-one-id PermissionsGroupMembership
                                    :group_id (u/get-id group)
                                    :user_id  (u/get-id user))
          original-membership-id (membership-id)]
      (integrations.common/sync-group-memberships! user #{group})
      (= original-membership-id
         (membership-id)))))

;; does syncing group memberships add users to new groups correctly?
(expect
  #{":metabase.integrations.common-test/group-1"
    ":metabase.integrations.common-test/group-2"
    "All Users"}
  (with-user-in-groups [group-1 {:name (str ::group-1)}
                        group-2 {:name (str ::group-2)}
                        user    [group-1]]
    (integrations.common/sync-group-memberships! user #{group-1 group-2})
    (group-memberships user)))

;; does syncing group memberships remove users from old groups correctly?
(expect
  #{"All Users"}
  (with-user-in-groups [group-1 {:name (str ::group-1)}
                        group-2 {:name (str ::group-2)}
                        user    [group-1]]
    (integrations.common/sync-group-memberships! user #{})
    (group-memberships user)))

;; does adding & removing at the same time work correctly?
(expect
  #{":metabase.integrations.common-test/group-2" "All Users"}
  (with-user-in-groups [group-1 {:name (str ::group-1)}
                        group-2 {:name (str ::group-2)}
                        user    [group-1]]
    (integrations.common/sync-group-memberships! user #{group-2})
    (group-memberships user)))

;; if we attempt to add a user to a group that doesn't exist, does the group sync complete for the other groups?

(expect
  #{"All Users" ":metabase.integrations.common-test/group"}
  (with-user-in-groups [group {:name (str ::group)}
                        user    [group]]
    (tu.log/suppress-output
      (integrations.common/sync-group-memberships! user [Integer/MAX_VALUE group]))
    (group-memberships user)))

;; are special groups like admin & all users ignored?
(expect
  #{"All Users"}
  (with-user-in-groups [user]
    (integrations.common/sync-group-memberships! user [(group/admin)])
    (group-memberships user)))
