(ns metabase.sso.common-test
  (:require
   [clojure.test :refer :all]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.sso.common :as integrations.common]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- group-memberships
  "Return set of names of PermissionsGroups `user` currently belongs to."
  [user]
  (when-let [group-ids (seq (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (u/the-id user)))]
    (t2/select-fn-set :name :model/PermissionsGroup :id [:in group-ids])))

(deftest sync-groups-test
  (testing "does syncing group memberships leave existing memberships in place if nothing has changed?"
    (mt/with-user-in-groups [group {:name (str ::group)}
                             user  [group]]
      (integrations.common/sync-group-memberships! user #{group} #{group})
      (is (= #{"All Users" ":metabase.sso.common-test/group"}
             (group-memberships user))))))

(deftest sync-groups-test-2
  (testing "the actual `PermissionsGroupMembership` object should not have been replaced"
    (mt/with-user-in-groups [group {:name (str ::group)}
                             user  [group]]
      (let [membership-id          #(t2/select-one-pk :model/PermissionsGroupMembership
                                                      :group_id (u/the-id group)
                                                      :user_id  (u/the-id user))
            original-membership-id (membership-id)]
        (integrations.common/sync-group-memberships! user #{group} #{group})
        (is (= original-membership-id
               (membership-id)))))))

(deftest sync-groups-test-3
  (testing "does syncing group memberships add users to new groups correctly?"
    (mt/with-user-in-groups [group-1 {:name (str ::group-1)}
                             group-2 {:name (str ::group-2)}
                             user    [group-1]]
      (integrations.common/sync-group-memberships! user #{group-1 group-2} #{group-1 group-2})
      (is (= #{":metabase.sso.common-test/group-1"
               ":metabase.sso.common-test/group-2"
               "All Users"}
             (group-memberships user))))))

(deftest sync-groups-test-4
  (testing "does syncing group memberships remove users from old groups correctly?"
    (mt/with-user-in-groups [group-1 {:name (str ::group-1)}
                             group-2 {:name (str ::group-2)}
                             user    [group-1]]
      (integrations.common/sync-group-memberships! user #{} #{group-1 group-2})
      (is (= #{"All Users"}
             (group-memberships user))))))

(deftest sync-groups-test-5
  (testing "does adding & removing at the same time work correctly?"
    (mt/with-user-in-groups [group-1 {:name (str ::group-1)}
                             group-2 {:name (str ::group-2)}
                             user    [group-1]]
      (integrations.common/sync-group-memberships! user #{group-2} #{group-1 group-2})
      (is (= #{":metabase.sso.common-test/group-2" "All Users"}
             (group-memberships user))))))

(deftest sync-groups-test-6
  (testing "are unmapped groups ignored when adding group memberships?"
    (mt/with-user-in-groups [group-1 {:name (str ::group-1)}
                             user    []]
      (integrations.common/sync-group-memberships! user #{group-1} #{})
      (is (= #{"All Users"} (group-memberships user))))))

(deftest sync-groups-test-7
  (testing "are unmapped groups ignored when removing group memberships?"
    (mt/with-user-in-groups [group-1 {:name (str ::group-1)}
                             user    [group-1]]
      (integrations.common/sync-group-memberships! user #{} #{})
      (is (= #{":metabase.sso.common-test/group-1"
               "All Users"}
             (group-memberships user))))))

(deftest sync-groups-test-8
  (testing "if we attempt to add a user to a group that doesn't exist, does the group sync complete for the other groups?"
    (mt/test-helpers-set-global-values!
      (mt/with-user-in-groups [group {:name (str ::group)}
                               user    []]
        (integrations.common/sync-group-memberships! user #{Integer/MAX_VALUE group} #{Integer/MAX_VALUE group})
        (is (= #{"All Users" ":metabase.sso.common-test/group"}
               (group-memberships user)))))))

(deftest sync-groups-test-9a
  (mt/with-test-user :crowberto
    (testing "Admin should be synced just like a other groups group."
      (testing "remove admin role if users are not mapped to it"
        (mt/with-user-in-groups [user [(perms-group/admin)]]
          (integrations.common/sync-group-memberships! user #{} #{(perms-group/admin)})
          (is (= #{"All Users"}
                 (group-memberships user))))))))

(deftest sync-groups-test-9b
  (mt/with-test-user :crowberto
    (testing "Admin should be synced just like a other groups group."
      (testing "but it's ignored if admin is not in mappings"
        (mt/with-user-in-groups [user [(perms-group/admin)]]
          (integrations.common/sync-group-memberships! user #{} #{})
          (is (= #{"All Users" "Administrators"}
                 (group-memberships user))))))))

(deftest sync-groups-test-9c
  (mt/with-test-user :crowberto
    (testing "Admin should be synced just like a other groups group."
      (testing "add admin role if the users are mapped to it"
        (mt/with-user-in-groups [user []]
          (integrations.common/sync-group-memberships! user #{(perms-group/admin)} #{(perms-group/admin)})
          (is (= #{"All Users" "Administrators"}
                 (group-memberships user))))))))

(deftest sync-groups-test-9d
  (mt/with-test-user :crowberto
    (testing "Admin should be synced just like a other groups group."
      (testing "unmapped admin group is ignored even if other groups are added (#29718)"
        (mt/with-user-in-groups [group {:name (str ::group)}
                                 user  [(perms-group/admin)]]
          (integrations.common/sync-group-memberships! user #{group} #{group})
          (is (= #{"All Users" "Administrators" ":metabase.sso.common-test/group"}
                 (group-memberships user))))))))

(deftest sync-groups-test-10
  (testing "Make sure the delete last admin exception is catched"
    (mt/with-log-level :warn
      (mt/with-user-in-groups [user [(perms-group/admin)]]
        (let [log-warn-count (atom #{})]
          (with-redefs [t2/delete!
                        (fn [model & _args]
                          (when (= model :model/PermissionsGroupMembership)
                            (throw (ex-info (str perms-group-membership/fail-to-remove-last-admin-msg)
                                            {:status-code 400}))))
                        clojure.tools.logging/log*
                        (fn [_logger level _throwable msg]
                          (when (:= level :warn)
                            (swap! log-warn-count conj msg)))]
            ;; make sure sync run without throwing exception
            (integrations.common/sync-group-memberships! user #{} #{(perms-group/admin)})
            ;; make sure we log a msg for that
            (is (@log-warn-count
                 (str "Attempted to remove the last admin during group sync! "
                      "Check your SSO group mappings and make sure the Administrators group is mapped correctly.")))))))))
