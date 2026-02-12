(ns metabase-enterprise.data-studio.permissions.query-test
  "Tests for published table query permissions.
  Published tables can be queried via collection permissions instead of data permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :refer [*current-user-id* *current-user-permissions-set* *is-superuser?*]]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest published-table-test
  (testing "Published tables grant query access via collection permissions only with library enabled\n"
    (doseq [features             [#{} #{:library}]
            collection-readable? [false true]
            table-is-published?  [false true]
            view-data            [:unrestricted :blocked]]
      (testing (format "with features %s, collection-readable? %s, table-is-published? %s, view-data %s"
                       (pr-str features) collection-readable? table-is-published? view-data)
        (mt/with-premium-features features
          (let [mbql-query (mt/mbql-query venues)]
            (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
              (t2/with-transaction [_conn nil {:rollback-only true}]
                (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                               :model/User {user-id :id} {}
                               :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                               :model/Collection {collection-id :id} {}]
                  ;; Ensure All Users group has no create-queries permission and matching view-data
                  ;; (user is automatically in this group)
                  (perms/set-database-permission! (perms/all-users-group) (mt/id)         :perms/view-data      view-data)
                  (perms/set-database-permission! (perms/all-users-group) (mt/id)         :perms/create-queries :no)
                  (perms/set-table-permission!    (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
                  ;; Set up permissions on custom group: user cannot create queries, view-data varies
                  (perms/set-database-permission! group-id (mt/id) :perms/view-data      view-data)
                  (perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
                  (when table-is-published?
                    (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id collection-id}))
                  (if collection-readable?
                    (perms/grant-collection-read-permissions! group-id collection-id)
                    (do
                      ;; Revoke from both groups since user is in All Users automatically
                      (perms/revoke-collection-permissions! group-id collection-id)
                      (perms/revoke-collection-permissions! (perms/all-users-group) collection-id)))
                  (binding [*current-user-id*              user-id
                            *current-user-permissions-set* (delay (if collection-readable?
                                                                    #{(perms/collection-read-path collection-id)}
                                                                    #{}))]
                    (perms/disable-perms-cache
                      ;; Query is only runnable when: library enabled AND collection readable AND table published AND view-data unrestricted
                      (is (= (and (contains? features :library)
                                  collection-readable?
                                  table-is-published?
                                  (not= view-data :blocked))
                             (query-perms/can-run-query? mbql-query))))))))))))))

(deftest published-table-does-not-grant-view-data-test
  (mt/with-premium-features #{:library}
    (testing "Published tables with collection permissions should NOT grant view-data permissions"
      (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
        (t2/with-transaction [_conn nil {:rollback-only true}]
          ;; Create a test user that only belongs to all-users group (no extra permissions)
          (mt/with-temp [:model/User       {user-id :id} {:email "view-data-test@example.com"}
                         :model/Collection collection {}]
            ;; Publish the venues table into this collection
            (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
            (let [all-users (perms/all-users-group)]
              ;; Set database-level permissions first to establish baseline
              (perms/set-database-permission! all-users (mt/id) :perms/view-data :blocked)
              (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
              ;; Grant collection read permission
              (perms/grant-collection-read-permissions! all-users (u/the-id collection))
              ;; Set table-level permissions
              (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
              (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :blocked)

              (perms/disable-perms-cache
                (binding [*current-user-id*              user-id
                          *current-user-permissions-set* (delay (perms/user-permissions-set user-id))
                          *is-superuser?*                false]
                  (testing "Should grant create-queries via collection permissions"
                    (is (= :query-builder
                           (perms/table-permission-for-user user-id :perms/create-queries (mt/id) (mt/id :venues)))
                        "Collection permissions should grant query-builder permission"))
                  (testing "Should NOT grant view-data via collection permissions"
                    (is (= :blocked
                           (perms/table-permission-for-user user-id :perms/view-data (mt/id) (mt/id :venues)))
                        "Collection permissions should NOT grant view-data permission")))))))))))

(deftest published-table-grants-database-access-test
  (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
    (mt/with-premium-features #{:library}
      (testing "POST /api/dataset in EE: published table access GRANTS database access"
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (mt/with-temp [:model/User       {user-id :id} {:email "ee-db-access-test@example.com"}
                         :model/Collection collection {}]
            ;; Publish the venues table into this collection
            (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
            (let [all-users (perms/all-users-group)]
              ;; Set database-level permissions first to establish baseline
              (perms/set-database-permission! all-users (mt/id) :perms/view-data :unrestricted)
              (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
              ;; Grant collection read permission - this gives create-queries via published table mechanism
              (perms/grant-collection-read-permissions! all-users (u/the-id collection))
              ;; Set table-level permissions
              (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
              (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
              ;; With collection permission on published table, query should succeed
              (testing "Query should succeed because EE grants create-queries via published table mechanism"
                (is (=? {:status    "completed"
                         :row_count pos-int?}
                        (mt/with-current-user user-id
                          (mt/user-http-request user-id :post 202 "dataset"
                                                (mt/mbql-query venues {:limit 1}))))))))))
      (testing "POST /api/dataset in EE: without collection permission, published table does NOT grant access"
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (mt/with-temp [:model/User       {user-id :id} {:email "ee-db-access-test2@example.com"}
                         :model/Collection collection {}]
            ;; Publish the venues table into this collection
            (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
            (let [all-users (perms/all-users-group)]
              ;; Set database-level permissions first to establish baseline
              (perms/set-database-permission! all-users (mt/id) :perms/view-data :unrestricted)
              (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
              ;; DON'T grant collection read permission - revoke it explicitly
              (perms/revoke-collection-permissions! all-users collection)
              ;; Set table-level permissions
              (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
              (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
              ;; Without collection permission, query should fail at database check (403)
              (testing "Query should fail because user has no collection permission on published table"
                (is (= "You don't have permissions to do that."
                       (mt/with-current-user user-id
                         (mt/user-http-request user-id :post 403 "dataset"
                                               (mt/mbql-query venues {:limit 1})))))))))))))
