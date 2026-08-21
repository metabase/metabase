(ns metabase-enterprise.sandbox.api.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [metabase-enterprise.test :as met]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest sandbox-caching-test
  (testing "`sandboxed-user?` and `enforced-sandboxes-for-tables` use the cache"
    (mt/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        ;; retrieve the cache now (and realize its values) so it doesn't get included in call count
        (doall @data-perms/*sandboxes-for-user*)
        ;; make the cache wrong
        (t2/delete! :model/Sandbox :group_id (:id &group))
        ;; Resolve this outside the call-count window. Within a `with-temp` transaction, test-data ID lookups
        ;; intentionally bypass their cache, so `(mt/id :venues)` executes another query.
        (let [venues-id (mt/id :venues)]
          ;; Subsequent calls should use the cache without querying the DB.
          (t2/with-call-count [call-count]
            (is (sandbox.api.util/sandboxed-user?))
            (is (zero? (call-count)))
            (is (= 1 (count (sandbox.api.util/enforced-sandboxes-for-tables [venues-id]))))
            (is (zero? (call-count)))))))))

(deftest enforce-sandbox?-test
  (testing "If a user is in a single group with a sandbox, the sandbox should be enforced"
    (mt/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (is (sandbox.api.util/sandboxed-user?)))))
  (testing "If a user is in another group with view data access, the sandbox should not be enforced"
    (mt/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (mt/with-full-data-perms-for-all-users!
          (is (not (sandbox.api.util/sandboxed-user?)))))))
  (testing "A data app group grants non-sandboxed tables without disabling sandboxing"
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/DataApp _ {:name                "sandboxes"
                                     :display_name        "Sandboxes"
                                     :bundle_path         "data_apps/sandboxes/index.js"
                                     :permission_group_id group-id}
                   :model/PermissionsGroupMembership _ {:user_id  user-id
                                                        :group_id group-id}]
      (met/with-gtaps-for-user! user-id {:gtaps {:venues {}}}
        (let [database-id       (mt/id)
              sandboxed-table-id (mt/id :venues)
              granted-table-id   (mt/id :users)]
          (data-perms/set-table-permission! group-id sandboxed-table-id :perms/view-data :unrestricted)
          (data-perms/set-table-permission! group-id granted-table-id :perms/view-data :unrestricted)
          (is (sandbox.api.util/sandboxed-user?))
          (is (= #{sandboxed-table-id}
                 (into #{} (map :table_id)
                       (sandbox.api.util/enforced-sandboxes-for-tables #{sandboxed-table-id granted-table-id}))))
          (is (= :unrestricted
                 (data-perms/table-permission-for-user user-id :perms/view-data database-id sandboxed-table-id)))
          (is (= :unrestricted
                 (data-perms/table-permission-for-user user-id :perms/view-data database-id granted-table-id)))))))
  (testing "If a user is in another group with another sandbox defined on the table, the user should be considered sandboxed"
    ;; This (conflicting sandboxes) is an invalid state for the QP but `enforce-sandbox?` should return true in order
    ;; to fail closed
    (mt/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
          (is (sandbox.api.util/sandboxed-user?))))))
  (testing "If a user is in another group with an impersonation policy defined on the table, the user should be considered sandboxed"
    ;; Similar to above, this is also an unsupported configuration for querying, but we want to treat this user as
    ;; sandboxed
    (mt/with-temp [:model/User {user-id :id} {}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id user-id
                                                        :group_id group-id}]
      (met/with-gtaps-for-user! user-id {:gtaps {:venues {}}}
        (mt/with-temp [:model/ConnectionImpersonation _ {:db_id (mt/id)
                                                         :group_id group-id
                                                         :attribute "test-attribute"}]
          (is (sandbox.api.util/sandboxed-user?))))))
  (testing "If a user is in two groups with conflicting sandboxes, *and* a third group that grants full access to the table,
            neither sandbox is enforced"
    (mt/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
          (mt/with-full-data-perms-for-all-users!
            (is (not (sandbox.api.util/sandboxed-user?)))))))))

(defn- has-segmented-perms-when-segmented-db-exists?! [user-kw]
  (testing "User is sandboxed when they are not in any other groups that provide unrestricted access"
    (met/with-gtaps-for-user! user-kw {:gtaps {:venues {}}}
      (sandbox.api.util/sandboxed-user?))))

(deftest never-segment-admins-test
  (testing "Admins should not be classified as segmented users -- enterprise #147"
    (testing "Non-admin"
      (is (has-segmented-perms-when-segmented-db-exists?! :rasta)))
    (testing "Admin"
      (is (not (has-segmented-perms-when-segmented-db-exists?! :crowberto))))))
