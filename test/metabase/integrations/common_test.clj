(ns metabase.integrations.common-test
  (:require [clojure.test :refer :all]
            [metabase.integrations.common :as integrations.common]
            [metabase.models.permissions-group :as group :refer [PermissionsGroup]]
            [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
            [metabase.test :as mt :refer [with-user-in-groups]]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

(defn- group-memberships
  "Return set of names of PermissionsGroups `user` currently belongs to."
  [user]
  (when-let [group-ids (seq (db/select-field :group_id PermissionsGroupMembership :user_id (u/the-id user)))]
    (db/select-field :name PermissionsGroup :id [:in group-ids])))

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
