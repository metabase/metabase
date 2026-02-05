(ns metabase-enterprise.data-studio.permissions.published-tables-test
  "Tests for the can-access-via-collection? function in the published-tables namespace."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest can-access-via-collection?-returns-false-for-non-published-tables-test
  (testing "Returns false for non-published tables"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection collection {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Table table {:is_published false :collection_id (:id collection)}]
        (perms/grant-collection-read-permissions! group-id (:id collection))
        (mt/with-current-user user-id
          (is (false? (boolean (published-tables/can-access-via-collection? table)))))))))

(deftest can-access-via-collection?-returns-true-with-collection-access-test
  (testing "Returns true for published tables when user has collection access"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection collection {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Table table {:is_published true :collection_id (:id collection)}]
        (perms/grant-collection-read-permissions! group-id (:id collection))
        (mt/with-current-user user-id
          (is (true? (boolean (published-tables/can-access-via-collection? table)))))))))

(deftest can-access-via-collection?-returns-false-without-collection-access-test
  (testing "Returns false for published tables when user lacks collection access"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection collection {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Table table {:is_published true :collection_id (:id collection)}]
        ;; Don't grant collection permissions
        (perms/revoke-collection-permissions! group-id (:id collection))
        (perms/revoke-collection-permissions! (perms/all-users-group) (:id collection))
        (mt/with-current-user user-id
          (is (false? (boolean (published-tables/can-access-via-collection? table)))))))))

(deftest can-access-via-collection?-returns-false-without-data-studio-feature-test
  (testing "Returns false when data-studio feature is not enabled"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection collection {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Table table {:is_published true :collection_id (:id collection)}]
        (perms/grant-collection-read-permissions! group-id (:id collection))
        (mt/with-current-user user-id
          (is (false? (boolean (published-tables/can-access-via-collection? table)))))))))

(deftest published-table-visible-clause-filters-by-collection-perms-test
  (testing "Returns clause that only includes published tables in readable collections"
    (mt/with-premium-features #{:data-studio}
      (mt/with-temp [:model/Collection {allowed-coll-id :id} {}
                     :model/Collection {blocked-coll-id :id} {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Table {allowed-table-id :id} {:is_published true :collection_id allowed-coll-id}
                     :model/Table {blocked-table-id :id} {:is_published true :collection_id blocked-coll-id}
                     :model/Table _ {:is_published false :collection_id allowed-coll-id}]
        (perms/grant-collection-read-permissions! group-id allowed-coll-id)
        (perms/revoke-collection-permissions! group-id blocked-coll-id)
        (perms/revoke-collection-permissions! (perms/all-users-group) blocked-coll-id)
        (let [clause (published-tables/published-table-visible-clause
                      :id
                      {:user-id user-id
                       :is-superuser? false})]
          (is (= #{allowed-table-id}
                 (t2/select-pks-set :model/Table {:where [:and clause [:in :id [allowed-table-id blocked-table-id]]]}))))))))
