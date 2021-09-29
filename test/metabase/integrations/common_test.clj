(ns metabase.integrations.common-test
  (:require [clojure.test :refer :all]
            [metabase.integrations.common :as integrations.common]
            [metabase.models.permissions-group :as group :refer [PermissionsGroup]]
            [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
            [metabase.models.user :refer [User]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :db))

(defn- group-memberships
  "Return set of names of PermissionsGroups `user` currently belongs to."
  [user]
  (when-let [group-ids (seq (db/select-field :group_id PermissionsGroupMembership :user_id (u/the-id user)))]
    (db/select-field :name PermissionsGroup :id [:in group-ids])))

(defn- do-with-user-in-groups
  ([f groups-or-ids]
   (tt/with-temp User [user]
     (do-with-user-in-groups f user groups-or-ids)))
  ([f user [group-or-id & more]]
   (if group-or-id
     (tt/with-temp PermissionsGroupMembership [_ {:group_id (u/the-id group-or-id), :user_id (u/the-id user)}]
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

(deftest sync-groups-test
  (testing "does syncing group memberships leave existing memberships in place if nothing has changed?"
    (with-user-in-groups [group {:name (str ::group)}
                          user  [group]]
      (integrations.common/sync-group-memberships! user #{group} #{group} false)
      (is (= #{"All Users" ":metabase.integrations.common-test/group"}
             (group-memberships user)))))

  (testing "the actual `PermissionsGroupMembership` object should not have been replaced"
    (with-user-in-groups [group {:name (str ::group)}
                          user  [group]]
      (let [membership-id          #(db/select-one-id PermissionsGroupMembership
                                                      :group_id (u/the-id group)
                                                      :user_id  (u/the-id user))
            original-membership-id (membership-id)]
        (integrations.common/sync-group-memberships! user #{group} #{group} false)
        (is (= original-membership-id
               (membership-id))))))

  (testing "does syncing group memberships add users to new groups correctly?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          group-2 {:name (str ::group-2)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{group-1 group-2} #{group-1 group-2} false)
      (is (= #{":metabase.integrations.common-test/group-1"
               ":metabase.integrations.common-test/group-2"
               "All Users"}
             (group-memberships user)))))

  (testing "does syncing group memberships remove users from old groups correctly?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          group-2 {:name (str ::group-2)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{} #{group-1 group-2} false)
      (is (= #{"All Users"}
             (group-memberships user)))))

  (testing "does adding & removing at the same time work correctly?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          group-2 {:name (str ::group-2)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{group-2} #{group-1 group-2} false)
      (is (= #{":metabase.integrations.common-test/group-2" "All Users"}
             (group-memberships user)))))

  (testing "are unmapped groups ignored when adding group memberships?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          user    []]
      (integrations.common/sync-group-memberships! user #{group-1} #{} false)
      (is (= #{"All Users"} (group-memberships user)))))

  (testing "are unmapped groups ignored when removing group memberships?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{} #{} false)
      (is (= #{":metabase.integrations.common-test/group-1"
               "All Users"}
             (group-memberships user)))))

  (testing "if we attempt to add a user to a group that doesn't exist, does the group sync complete for the other groups?"
    (with-user-in-groups [group {:name (str ::group)}
                          user    []]
      (tu.log/suppress-output
       (integrations.common/sync-group-memberships! user #{Integer/MAX_VALUE group} #{Integer/MAX_VALUE group} false))
      (is (= #{"All Users" ":metabase.integrations.common-test/group"}
             (group-memberships user)))))

  (mt/with-test-user :crowberto
    (testing "with admin group sync enabled"
      (testing "are admins synced?"
        (with-user-in-groups [user]
          (integrations.common/sync-group-memberships! user [(group/admin)] #{} true)
          (is (= #{"Administrators" "All Users"}
                 (group-memberships user)))))

      (testing "are administrators removed appropriately?"
        (with-user-in-groups [user [(group/admin)]]
          (integrations.common/sync-group-memberships! user [] #{} true)
          (is (= #{"All Users"}
                 (group-memberships user)))))))

  (testing "with admin group sync disabled"
    (testing "are admins synced?"
      (with-user-in-groups [user]
        (integrations.common/sync-group-memberships! user [(group/admin)] #{} false)
        (is (= #{"All Users"}
               (group-memberships user)))))

    (testing "are administrators removed appropriately?"
      (with-user-in-groups [user [(group/admin)]]
        (integrations.common/sync-group-memberships! user [] #{} false)
        (is (= #{"Administrators" "All Users"}
               (group-memberships user)))))))
