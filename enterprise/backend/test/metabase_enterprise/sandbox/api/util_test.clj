(ns metabase-enterprise.sandbox.api.util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [metabase-enterprise.test :as met]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.users.models.user :as user]
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
    (mt/with-model-cleanup [:model/User]
      (let [[user] (user/create-users! [{:email "enforce-sandbox-test-1@example.com"}])]
        (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
          (is (sandbox.api.util/sandboxed-user?))))))
  (testing "If a user is in another group with view data access, the sandbox should not be enforced"
    (mt/with-model-cleanup [:model/User]
      (let [[user] (user/create-users! [{:email "enforce-sandbox-test-2@example.com"}])]
        (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
          (mt/with-full-data-perms-for-all-users!
            (is (not (sandbox.api.util/sandboxed-user?))))))))
  (testing "If a user is in another group with another sandbox defined on the table, the user should be considered sandboxed"
    ;; This (conflicting sandboxes) is an invalid state for the QP but `enforce-sandbox?` should return true in order
    ;; to fail closed
    (mt/with-model-cleanup [:model/User]
      (let [[user] (user/create-users! [{:email "enforce-sandbox-test-3@example.com"}])]
        (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
          (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
            (is (sandbox.api.util/sandboxed-user?)))))))
  (testing "If a user is in another group with an impersonation policy defined on the table, the user should be considered sandboxed"
    ;; Similar to above, this is also an unsupported configuration for querying, but we want to treat this user as
    ;; sandboxed
    (mt/with-model-cleanup [:model/User]
      (let [[{user-id :id}] (user/create-users! [{:email "enforce-sandbox-test-4@example.com"}])]
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                       :model/PermissionsGroupMembership _ {:user_id user-id
                                                            :group_id group-id}]
          (met/with-gtaps-for-user! user-id {:gtaps {:venues {}}}
            (mt/with-temp [:model/ConnectionImpersonation _ {:db_id (mt/id)
                                                             :group_id group-id
                                                             :attribute "test-attribute"}]
              (is (sandbox.api.util/sandboxed-user?))))))))
  (testing "If a user is in two groups with conflicting sandboxes, *and* a third group that grants full access to the table,
            neither sandbox is enforced"
    (mt/with-model-cleanup [:model/User]
      (let [[user] (user/create-users! [{:email "enforce-sandbox-test-5@example.com"}])]
        (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
          (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
            (mt/with-full-data-perms-for-all-users!
              (is (not (sandbox.api.util/sandboxed-user?))))))))))

(deftest sandboxed-user?-without-sandboxes-feature-test
  (testing "A configured sandbox is still reported when the `:sandboxes` feature is unavailable (e.g. token check failing)"
    (mt/with-temp [:model/User user {}]
      (met/with-gtaps-for-user! (u/the-id user) {:gtaps {:venues {}}}
        (mt/with-premium-features #{}
          (is (sandbox.api.util/sandboxed-user?)))))))

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

(defn- insert-sandboxed-tables!
  "Inserts a Database with `n` Tables, gives All Users no view-data access to it, sandboxes every Table for the group
  with `sandboxed-group-id`, and gives the group with `other-group-id` unrestricted view-data access to the Tables at
  even positions only; returns the Table ids."
  [n sandboxed-group-id other-group-id]
  (let [db-id     (first (t2/insert-returning-pks! :model/Database [(mt/with-temp-defaults :model/Database)]))
        table-ids (vec (t2/insert-returning-pks! :model/Table
                                                 (repeatedly n #(merge (mt/with-temp-defaults :model/Table)
                                                                       {:db_id db-id :active true}))))]
    (data-perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :blocked)
    (data-perms/set-database-permission! sandboxed-group-id db-id :perms/view-data :unrestricted)
    (data-perms/set-table-permissions! other-group-id :perms/view-data
                                       (into {} (map-indexed (fn [i id] [id (if (even? i) :unrestricted :blocked)]))
                                             table-ids))
    (t2/insert! :model/Sandbox (for [table-id table-ids]
                                 {:group_id sandboxed-group-id :table_id table-id :card_id nil :attribute_remappings {}}))
    table-ids))

(deftest enforced-sandboxes-for-user-in-bulk-test
  (testing "A sandbox is enforced exactly where no other group of the user gives unrestricted access, in as many statements for 8 Tables as for 2"
    (mt/with-temp [:model/PermissionsGroup           {sandboxed :id} {}
                   :model/PermissionsGroup           {other :id}     {}
                   :model/PermissionsGroupMembership _               {:group_id sandboxed :user_id (mt/user->id :rasta)}
                   :model/PermissionsGroupMembership _               {:group_id other :user_id (mt/user->id :rasta)}]
      (mt/with-model-cleanup [:model/Sandbox :model/Database]
        (let [enforced (fn [n]
                         (let [table-ids (insert-sandboxed-tables! n sandboxed other)
                               _         (sandbox.api.util/enforced-sandboxes-for-user (mt/user->id :rasta))
                               [result c] (t2/with-call-count [call-count]
                                            [(set (keep (comp (set table-ids) :table_id)
                                                        (sandbox.api.util/enforced-sandboxes-for-user (mt/user->id :rasta))))
                                             (call-count)])]
                           (is (= (set (take-nth 2 (rest table-ids))) result))
                           c))]
          (is (= (enforced 2) (enforced 8))))))))
