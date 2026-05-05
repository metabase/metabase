(ns metabase-enterprise.data-studio.permissions.published-tables-test
  "Tests for the can-access-via-collection? function in the published-tables namespace."
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
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
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection {allowed-coll-id :id} {}
                     :model/Collection {blocked-coll-id :id} {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Table {allowed-table-id :id} {:is_published true :collection_id allowed-coll-id}
                     :model/Table {blocked-table-id :id} {:is_published true :collection_id blocked-coll-id}
                     :model/Table _ {:is_published false :collection_id allowed-coll-id}]
        (mt/with-no-data-perms-for-all-users!
          (perms/grant-collection-read-permissions! group-id allowed-coll-id)
          (perms/revoke-collection-permissions! group-id blocked-coll-id)
          (perms/revoke-collection-permissions! (perms/all-users-group) blocked-coll-id)
          (let [clause (published-tables/published-table-visible-clause
                        :id
                        {:user-id user-id
                         :is-superuser? false})]
            (is (= #{allowed-table-id}
                   (t2/select-pks-set :model/Table {:where [:and clause [:in :id [allowed-table-id blocked-table-id]]]})))))))))

(deftest published-table-perm-grant-rows-returns-nil-without-create-queries-test
  (testing "Returns nil when permission-mapping doesn't include :perms/create-queries"
    (mt/with-premium-features #{:library}
      (let [user-info {:user-id 1 :is-superuser? false}]
        (is (nil? (published-tables/published-table-perm-grant-rows
                   user-info [:perms/view-data] false)))
        (is (nil? (published-tables/published-table-perm-grant-rows
                   user-info [:perms/manage-table-metadata] false)))))))

(deftest published-table-perm-grant-rows-returns-nil-without-library-feature-test
  (testing "OSS stub returns nil even when create-queries is requested"
    (mt/with-premium-features #{}
      (let [user-info {:user-id 1 :is-superuser? false}]
        (is (nil? (published-tables/published-table-perm-grant-rows
                   user-info [:perms/create-queries] false)))))))

(deftest published-table-perm-grant-rows-produces-create-queries-grants-test
  (testing "Returns SELECT producing (id, perms/create-queries, query-builder) rows for published+visible tables"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection {allowed-coll-id :id} {}
                     :model/Collection {blocked-coll-id :id} {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                     :model/Database {db-id :id} {}
                     :model/Table {visible-pub-id :id}
                     {:db_id db-id :is_published true :collection_id allowed-coll-id :active true}
                     :model/Table {hidden-pub-id :id}
                     {:db_id db-id :is_published true :collection_id blocked-coll-id :active true}
                     :model/Table {unpub-id :id}
                     {:db_id db-id :is_published false :collection_id allowed-coll-id :active true}
                     :model/Table {inactive-pub-id :id}
                     {:db_id db-id :is_published true :collection_id allowed-coll-id :active false}]
        (mt/with-no-data-perms-for-all-users!
          (perms/grant-collection-read-permissions! group-id allowed-coll-id)
          (perms/revoke-collection-permissions! group-id blocked-coll-id)
          (perms/revoke-collection-permissions! (perms/all-users-group) blocked-coll-id)
          (let [user-info {:user-id user-id :is-superuser? false}
                table-ids #{visible-pub-id hidden-pub-id unpub-id inactive-pub-id}
                run-grant-rows
                (fn [active-only?]
                  (let [select (published-tables/published-table-perm-grant-rows
                                user-info [:perms/create-queries] active-only?)]
                    (->> (t2/query (update select :where (fn [w] [:and w [:in :mt.id table-ids]])))
                         (map (juxt :id :perm_type :perm_value))
                         set)))]
            (testing "without active-only? both active and inactive published+visible tables produce grants"
              (is (= #{[visible-pub-id "perms/create-queries" "query-builder"]
                       [inactive-pub-id "perms/create-queries" "query-builder"]}
                     (run-grant-rows false))))
            (testing "with active-only? inactive tables are excluded"
              (is (= #{[visible-pub-id "perms/create-queries" "query-builder"]}
                     (run-grant-rows true))))))))))

(deftest visible-filter-clause-include-published-via-collection-test
  (testing "visible-filter-clause :model/Table extends visibility via published+collection grants when requested"
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/Collection {allowed-coll-id :id} {}
                     :model/Collection {blocked-coll-id :id} {}
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
          (let [user-info {:user-id user-id :is-superuser? false}
                run (fn [opts]
                      (let [{:keys [clause with]}
                            (mi/visible-filter-clause :model/Table :id user-info
                                                      {:perms/view-data :unrestricted
                                                       :perms/create-queries :query-builder}
                                                      opts)]
                        (t2/select-pks-set :model/Table
                                           (cond-> {:where [:and [:= :db_id db-id] clause]}
                                             with (assoc :with with)))))]
            (testing "without :include-published-via-collection? only the data-perms grant lets a table through"
              (is (= #{plain-allowed} (run nil))))
            (testing "with :include-published-via-collection? the published+visible-collection table also passes"
              (is (= #{plain-allowed pub-allowed}
                     (run {:include-published-via-collection? true}))))
            (testing "unpublished or non-visible-collection tables do not pass via the published path"
              (let [visible (run {:include-published-via-collection? true})]
                (is (not (contains? visible pub-blocked)))
                (is (not (contains? visible unpub-allowed)))))
            (testing "view-data :blocked at the table level still excludes the table even when published+visible"
              (let [visible (run {:include-published-via-collection? true})]
                (is (not (contains? visible pub-blocked-by-view-data)))))
            (testing "the returned :clause is a single IN — no top-level :or"
              (let [{:keys [clause]} (mi/visible-filter-clause
                                      :model/Table :id user-info
                                      {:perms/view-data :unrestricted
                                       :perms/create-queries :query-builder}
                                      {:include-published-via-collection? true})]
                (is (= :in (first clause)))))))))))
