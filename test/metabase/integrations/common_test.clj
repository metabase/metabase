(ns metabase.integrations.common-test
  (:require
   [clojure.test :refer :all]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [clojure.tools.logging]
   [metabase.integrations.common :as integrations.common]
   [metabase.models.permissions-group
    :as perms-group
    :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership
    :as perms-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.test :as mt :refer [with-user-in-groups]]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- group-memberships
  "Return set of names of PermissionsGroups `user` currently belongs to."
  [user]
  (when-let [group-ids (seq (t2/select-fn-set :group_id PermissionsGroupMembership :user_id (u/the-id user)))]
    (t2/select-fn-set :name PermissionsGroup :id [:in group-ids])))

(deftest sync-groups-test
  (testing "does syncing group memberships leave existing memberships in place if nothing has changed?"
    (with-user-in-groups [group {:name (str ::group)}
                          user  [group]]
      (integrations.common/sync-group-memberships! user #{group} #{group})
      (is (= #{"All Users" ":metabase.integrations.common-test/group"}
             (group-memberships user)))))

  (testing "the actual `PermissionsGroupMembership` object should not have been replaced"
    (with-user-in-groups [group {:name (str ::group)}
                          user  [group]]
      (let [membership-id          #(t2/select-one-pk PermissionsGroupMembership
                                                      :group_id (u/the-id group)
                                                      :user_id  (u/the-id user))
            original-membership-id (membership-id)]
        (integrations.common/sync-group-memberships! user #{group} #{group})
        (is (= original-membership-id
               (membership-id))))))

  (testing "does syncing group memberships add users to new groups correctly?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          group-2 {:name (str ::group-2)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{group-1 group-2} #{group-1 group-2})
      (is (= #{":metabase.integrations.common-test/group-1"
               ":metabase.integrations.common-test/group-2"
               "All Users"}
             (group-memberships user)))))

  (testing "does syncing group memberships remove users from old groups correctly?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          group-2 {:name (str ::group-2)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{} #{group-1 group-2})
      (is (= #{"All Users"}
             (group-memberships user)))))

  (testing "does adding & removing at the same time work correctly?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          group-2 {:name (str ::group-2)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{group-2} #{group-1 group-2})
      (is (= #{":metabase.integrations.common-test/group-2" "All Users"}
             (group-memberships user)))))

  (testing "are unmapped groups ignored when adding group memberships?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          user    []]
      (integrations.common/sync-group-memberships! user #{group-1} #{})
      (is (= #{"All Users"} (group-memberships user)))))

  (testing "are unmapped groups ignored when removing group memberships?"
    (with-user-in-groups [group-1 {:name (str ::group-1)}
                          user    [group-1]]
      (integrations.common/sync-group-memberships! user #{} #{})
      (is (= #{":metabase.integrations.common-test/group-1"
               "All Users"}
             (group-memberships user)))))

  (testing "if we attempt to add a user to a group that doesn't exist, does the group sync complete for the other groups?"
    (mt/test-helpers-set-global-values!
      (with-user-in-groups [group {:name (str ::group)}
                            user    []]
        (integrations.common/sync-group-memberships! user #{Integer/MAX_VALUE group} #{Integer/MAX_VALUE group})
        (is (= #{"All Users" ":metabase.integrations.common-test/group"}
               (group-memberships user))))))

  (mt/with-test-user :crowberto
    (testing "Admin should be synced just like a other groups group."
      (testing "remove admin role if users are not mapped to it"
        (with-user-in-groups [user [(perms-group/admin)]]
          (integrations.common/sync-group-memberships! user #{} #{(perms-group/admin)})
          (is (= #{"All Users"}
                 (group-memberships user)))))

      (testing "but it's ignored if admin is not in mappings"
        (with-user-in-groups [user [(perms-group/admin)]]
          (integrations.common/sync-group-memberships! user #{} #{})
          (is (= #{"All Users" "Administrators"}
                 (group-memberships user)))))

      (testing "add admin role if the users are mapped to it"
        (with-user-in-groups [user []]
          (integrations.common/sync-group-memberships! user #{(perms-group/admin)} #{(perms-group/admin)})
          (is (= #{"All Users" "Administrators"}
                 (group-memberships user)))))

      (testing "unmapped admin group is ignored even if other groups are added (#29718)"
        (with-user-in-groups [group {:name (str ::group)}
                              user  [(perms-group/admin)]]
          (integrations.common/sync-group-memberships! user #{group} #{group})
          (is (= #{"All Users" "Administrators" ":metabase.integrations.common-test/group"}
                 (group-memberships user)))))))

  (testing "Make sure the delete last admin exception is catched"
    (mt/with-log-level :warn
      (with-user-in-groups [user [(perms-group/admin)]]
        (let [log-warn-count (atom #{})]
          (with-redefs [t2/delete!
                        (fn [model & _args]
                          (when (= model PermissionsGroupMembership)
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
