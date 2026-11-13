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
      (mt/with-temp [:model/Collection collection {:type "library-data"}
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
      (mt/with-temp [:model/Collection collection {:type "library-data"}
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
      (mt/with-temp [:model/Collection collection {:type "library-data"}
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

(deftest published-table-clause-oss-test
  (testing "OSS stub returns nil"
    (mt/with-premium-features #{}
      (is (nil? (published-tables/published-table-clause {:user-id 1 :is-superuser? false} :mt))))))

(deftest published-table-clause-selects-published-tables-in-readable-collections-test
  (testing "The clause holds for each Table published into a Collection the user can read"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection {allowed-coll-id :id} {:type "library-data"}
                     :model/Collection {blocked-coll-id :id} {:type "library-data"}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Database {db-id :id} {}
                     :model/Table {visible-pub-id :id}
                     {:db_id db-id :is_published true :collection_id allowed-coll-id :active true}
                     :model/Table {hidden-pub-id :id}
                     {:db_id db-id :is_published true :collection_id blocked-coll-id :active true}
                     :model/Table {unpub-id :id}
                     {:db_id db-id :is_published false :collection_id allowed-coll-id :active true}]
        (perms/grant-collection-read-permissions! group-id allowed-coll-id)
        (perms/revoke-collection-permissions! group-id blocked-coll-id)
        (perms/revoke-collection-permissions! (perms/all-users-group) blocked-coll-id)
        (is (= #{visible-pub-id}
               (into #{}
                     (map :id)
                     (t2/query {:select [:mt.id]
                                :from   [[:metabase_table :mt]]
                                :where  [:and
                                         [:in :mt.id [visible-pub-id hidden-pub-id unpub-id]]
                                         (published-tables/published-table-clause
                                          {:user-id user-id :is-superuser? false} :mt)]}))))))))

(deftest visible-tables-filter-clause-published-via-collection-test
  (testing "visible-tables-filter-clause extends visibility via published+collection grants"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection {allowed-coll-id :id} {:type "library-data"}
                     :model/Collection {blocked-coll-id :id} {:type "library-data"}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Database {db-id :id} {}
                     :model/Table {pub-allowed :id}
                     {:db_id db-id :is_published true :collection_id allowed-coll-id :active true}
                     :model/Table {pub-blocked :id}
                     {:db_id db-id :is_published true :collection_id blocked-coll-id :active true}
                     :model/Table {unpub-allowed :id}
                     {:db_id db-id :is_published false :collection_id allowed-coll-id :active true}
                     :model/Table {pub-blocked-by-view-data :id}
                     {:db_id db-id :is_published true :collection_id allowed-coll-id :active true}
                     :model/Table {plain-allowed :id}
                     {:db_id db-id :is_published false :active true}]
        (mt/with-no-data-perms-for-all-users!
          (perms/grant-collection-read-permissions! group-id allowed-coll-id)
          (perms/revoke-collection-permissions! group-id blocked-coll-id)
          (perms/revoke-collection-permissions! (perms/all-users-group) blocked-coll-id)
          ;; user has unrestricted view-data on the db, but no create-queries grants
          (t2/delete! :model/DataPermissions :db_id db-id)
          (perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
          (perms/set-database-permission! group-id db-id :perms/create-queries :no)
          ;; ...except for plain-allowed, which has both via real data_permissions
          (perms/set-table-permission! group-id plain-allowed :perms/create-queries :query-builder)
          ;; ...and pub-blocked-by-view-data, where view-data is :blocked overriding the db default
          (perms/set-table-permission! group-id pub-blocked-by-view-data :perms/view-data :blocked)
          (let [visible (t2/select-pks-set :model/Table
                                           {:where [:and [:= :db_id db-id]
                                                    (perms/visible-tables-filter-clause
                                                     :id {:user-id user-id :is-superuser? false}
                                                     {:perms/view-data      :unrestricted
                                                      :perms/create-queries :query-builder})]})]
            (testing "the data-perms grant and the published+visible-collection table pass"
              (is (= #{plain-allowed pub-allowed} visible)))
            (testing "unpublished or non-visible-collection tables do not pass via the published path"
              (is (not (contains? visible pub-blocked)))
              (is (not (contains? visible unpub-allowed))))
            (testing "view-data :blocked at the table level still excludes the table even when published+visible"
              (is (not (contains? visible pub-blocked-by-view-data))))))))))
