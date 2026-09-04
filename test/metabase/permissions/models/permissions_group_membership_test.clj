(ns metabase.permissions.models.permissions-group-membership-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest set-is-superuser-test
  (testing "when you create a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp [:model/User user]
      (perms/add-user-to-group! user (perms-group/admin))
      (is (true? (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))

(deftest remove-is-superuser-test
  (testing "when you delete a PermissionsGroupMembership for a User in the admin group, it should set their `is_superuser` flag"
    (mt/with-temp [:model/User user {:is_superuser true}]
      (perms/remove-user-from-group! user (perms-group/admin))
      (is (= false
             (t2/select-one-fn :is_superuser :model/User :id (u/the-id user))))))
  (testing "it should not let you remove the last admin"
    (mt/with-single-admin-user! [{id :id}]
      (is (thrown? Exception
                   (perms/remove-user-from-group! id (perms-group/admin))))))
  (testing "it should not let you remove the last non-archived admin"
    (mt/with-single-admin-user! [{id :id}]
      (mt/with-temp [:model/User _ {:is_active    false
                                    :is_superuser true}]
        (is (thrown? Exception
                     (perms/remove-user-from-group! id (perms-group/admin))))))))

(deftest permissions-group-membership-audit-add-test
  (testing "PermissionsGroupMembership audit events"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (let [initial-audit-count (t2/count :model/AuditLog)]
          (testing "adding user to group is audited"
            (perms/add-user-to-group! user-id group-id)
            (is (> (t2/count :model/AuditLog) initial-audit-count))
            (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-create" {:order-by [[:id :desc]]})]
              (is (some? audit-entry))
              (is (= "PermissionsGroupMembership" (:model audit-entry)))
              (is (= user-id (get-in audit-entry [:details :user_id])))
              (is (= group-id (get-in audit-entry [:details :group_id])))))
          (testing "removing user from group is audited"
            (let [before-remove-count (t2/count :model/AuditLog)]
              (perms/remove-user-from-group! user-id group-id)
              (is (> (t2/count :model/AuditLog) before-remove-count))
              (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-delete" {:order-by [[:id :desc]]})]
                (is (some? audit-entry))
                (is (= "PermissionsGroupMembership" (:model audit-entry)))
                (is (= user-id (get-in audit-entry [:details :user_id])))
                (is (= group-id (get-in audit-entry [:details :group_id])))))))))))

(deftest delete-membership-api-audit-test
  (testing "DELETE /api/permissions/membership/:id creates audit log entry"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (perms/add-user-to-group! user-id group-id)
        (let [membership-id (:id (t2/select-one :model/PermissionsGroupMembership
                                                :user_id user-id :group_id group-id))
              before-count  (t2/count :model/AuditLog :topic "group-membership-delete")]
          (mt/user-http-request :crowberto :delete 204
                                (format "permissions/membership/%d" membership-id))
          (is (= (inc before-count)
                 (t2/count :model/AuditLog :topic "group-membership-delete")))
          (let [audit-entry (t2/select-one :model/AuditLog :topic "group-membership-delete"
                                           {:order-by [[:id :desc]]})]
            (is (= "PermissionsGroupMembership" (:model audit-entry)))
            (is (= user-id (get-in audit-entry [:details :user_id])))
            (is (= group-id (get-in audit-entry [:details :group_id])))))))))

(deftest clear-group-membership-api-audit-test
  (testing "PUT /api/permissions/membership/:group-id/clear creates audit log entries"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {user-1-id :id} {}
                     :model/User {user-2-id :id} {}
                     :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (perms/add-user-to-group! user-1-id group-id)
        (perms/add-user-to-group! user-2-id group-id)
        (let [before-count (t2/count :model/AuditLog :topic "group-membership-delete")]
          (mt/user-http-request :crowberto :put 204
                                (format "permissions/membership/%d/clear" group-id))
          (is (= (+ 2 before-count)
                 (t2/count :model/AuditLog :topic "group-membership-delete"))))))))

(deftest direct-delete-guard-test
  (testing "Direct t2/delete! on :model/PermissionsGroupMembership throws"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (perms/add-user-to-group! user-id group-id)
      (is (thrown-with-msg? Exception #"Do not use `t2/delete!`"
                            (t2/delete! :model/PermissionsGroupMembership
                                        :user_id user-id :group_id group-id))))))

(defn- data-analyst-group-id []
  (u/the-id (perms-group/data-analyst)))

(defn- in-data-analyst-group? [user-id]
  (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id (data-analyst-group-id)))

(defn- is-data-analyst-flag [user-id]
  (t2/select-one-fn :is_data_analyst :model/User :id user-id))

(deftest add-to-data-analyst-group-without-advanced-permissions-test
  (testing "adding a user to the Data Analysts group is refused without the :advanced-permissions feature"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Advanced Permissions"
             (perms/add-user-to-group! user-id (data-analyst-group-id))))
        (testing "no membership is created"
          (is (not (in-data-analyst-group? user-id))))
        (testing "the is_data_analyst flag is not set"
          (is (not (is-data-analyst-flag user-id))))))))

(deftest existing-data-analysts-are-grandfathered-test
  (testing "an existing member keeps their membership when the feature goes away"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-premium-features #{:advanced-permissions}
        (perms/add-user-to-group! user-id (data-analyst-group-id)))
      (mt/with-premium-features #{}
        (testing "nothing revokes the membership or the flag"
          (is (in-data-analyst-group? user-id))
          (is (true? (boolean (is-data-analyst-flag user-id)))))
        (testing "but the group can only shrink from here"
          (mt/with-temp [:model/User {other-user-id :id} {}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo #"Advanced Permissions"
                 (perms/add-user-to-group! other-user-id (data-analyst-group-id))))))))))

(deftest add-to-data-analyst-group-with-advanced-permissions-test
  (testing "adding a user to the Data Analysts group works with the :advanced-permissions feature"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-premium-features #{:advanced-permissions}
        (perms/add-user-to-group! user-id (data-analyst-group-id))
        (is (in-data-analyst-group? user-id))
        (testing "and mirrors the membership onto the is_data_analyst flag"
          (is (true? (boolean (is-data-analyst-flag user-id)))))))))

(deftest remove-from-data-analyst-group-is-never-gated-test
  (testing "removing a user from the Data Analysts group works without the :advanced-permissions feature"
    (mt/with-temp [:model/User {user-id :id} {}]
      (mt/with-premium-features #{:advanced-permissions}
        (perms/add-user-to-group! user-id (data-analyst-group-id)))
      (mt/with-premium-features #{}
        (perms/remove-user-from-group! user-id (data-analyst-group-id))
        (is (not (in-data-analyst-group? user-id)))
        (testing "and unsets the is_data_analyst flag"
          (is (not (is-data-analyst-flag user-id))))))))

(deftest add-to-other-groups-is-not-gated-test
  (testing "the Data Analysts gate does not affect other groups"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (mt/with-premium-features #{}
        (perms/add-user-to-group! user-id group-id)
        (is (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))))))

(deftest add-to-data-analyst-group-in-a-batch-is-gated-test
  (testing "a batched add that includes the Data Analysts group is refused entirely"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {:name "Test Group"}]
      (mt/with-premium-features #{}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Advanced Permissions"
             (perms/add-user-to-groups! user-id [group-id (data-analyst-group-id)])))
        (is (not (in-data-analyst-group? user-id)))
        (testing "and the rest of the batch is not applied either"
          (is (not (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))))))))
