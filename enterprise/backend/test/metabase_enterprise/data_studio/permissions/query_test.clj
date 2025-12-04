(ns metabase-enterprise.data-studio.permissions.query-test
  "Tests for published table query permissions.
  Published tables can be queried via collection permissions instead of data permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :refer [*current-user-id* *current-user-permissions-set* *is-superuser?*]]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest published-table-test
  (mt/with-premium-features #{:data-studio}
    (testing "Published tables grant create-queries via collection permissions"
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; Create a test user that only belongs to all-users group (no extra permissions)
        (mt/with-temp [:model/User       {user-id :id} {:email "published-table-test@example.com"}
                       :model/Collection collection {}]
          ;; Publish the venues table into this collection
          (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
          (let [mbql-query (mt/mbql-query venues)
                all-users  (perms/all-users-group)]
            ;; Grant collection read permission
            (perms/grant-collection-read-permissions! all-users (u/the-id collection))
            ;; Remove data permissions - set create-queries to :no so only published table grants it
            (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
            ;; Explicitly set view-data to unrestricted for the table
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
            (testing "WITH collection permission and view-data, query should be allowed"
              (perms/disable-perms-cache
                (binding [*current-user-id*              user-id
                          *current-user-permissions-set* (delay (perms/user-permissions-set user-id))
                          *is-superuser?*                false]
                  (is (query-perms/can-run-query? mbql-query)))))
            ;; Block view-data - query should fail because published tables don't grant view-data
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :blocked)
            (testing "WITH collection permission but view-data blocked, query should be blocked"
              (perms/disable-perms-cache
                (binding [*current-user-id*              user-id
                          *current-user-permissions-set* (delay (perms/user-permissions-set user-id))
                          *is-superuser?*                false]
                  (is (not (query-perms/can-run-query? mbql-query))
                      "Published tables do not bypass view-data restrictions (sandboxing)"))))))))
    (testing "Published tables require collection permissions for create-queries"
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; Create a test user that only belongs to all-users group (no extra permissions)
        (mt/with-temp [:model/User       {user-id :id} {:email "published-table-test2@example.com"}
                       :model/Collection collection {}]
          ;; Publish the venues table into this collection but DON'T grant collection permission
          (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
          (let [mbql-query (mt/mbql-query venues)
                all-users  (perms/all-users-group)]
            ;; Explicitly REVOKE collection permission (new collections inherit from parent)
            (perms/revoke-collection-permissions! all-users collection)
            ;; Remove data permissions - set create-queries to :no
            (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
            ;; Set view-data to unrestricted but don't grant collection permission
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
            ;; Don't grant collection permission - user should not get create-queries
            (perms/disable-perms-cache
              (binding [*current-user-id*              user-id
                        *current-user-permissions-set* (delay (perms/user-permissions-set user-id))
                        *is-superuser?*                false]
                (is (not (query-perms/can-run-query? mbql-query))
                    "Without collection permission, published table should not be queryable")))))))))

(deftest published-table-does-not-grant-view-data-test
  (mt/with-premium-features #{:data-studio}
    (testing "Published tables with collection permissions should NOT grant view-data permissions"
      (t2/with-transaction [_conn nil {:rollback-only true}]
        ;; Create a test user that only belongs to all-users group (no extra permissions)
        (mt/with-temp [:model/User       {user-id :id} {:email "view-data-test@example.com"}
                       :model/Collection collection {}]
          ;; Publish the venues table into this collection
          (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
          (let [all-users (perms/all-users-group)]
            ;; Grant collection read permission
            (perms/grant-collection-read-permissions! all-users (u/the-id collection))
            ;; Remove data permissions so only published table can grant create-queries
            (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
            ;; Explicitly set view-data to blocked
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
                      "Collection permissions should NOT grant view-data permission"))))))))))

(deftest published-table-grants-database-access-test
  (mt/with-premium-features #{:data-studio}
    (testing "POST /api/dataset in EE: published table access GRANTS database access"
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (mt/with-temp [:model/User       {user-id :id} {:email "ee-db-access-test@example.com"}
                       :model/Collection collection {}]
          ;; Publish the venues table into this collection
          (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
          (let [all-users (perms/all-users-group)]
            ;; Grant collection read permission - this gives create-queries via published table mechanism
            (perms/grant-collection-read-permissions! all-users (u/the-id collection))
            ;; Grant view-data because published tables don't bypass sandboxing
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
            ;; Explicitly remove create-queries so only published table can grant it
            (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
            ;; Remove create-queries on ALL tables to ensure user can't read database via normal permissions
            (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
            ;; But keep view-data for the specific table we're testing
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
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
            ;; DON'T grant collection read permission - revoke it explicitly
            (perms/revoke-collection-permissions! all-users collection)
            ;; Remove create-queries on ALL tables to ensure user can't read database
            (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
            ;; Grant view-data for the specific table
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
            ;; Without collection permission, query should fail at database check (403)
            (testing "Query should fail because user has no collection permission on published table"
              (is (= "You don't have permissions to do that."
                     (mt/with-current-user user-id
                       (mt/user-http-request user-id :post 403 "dataset"
                                             (mt/mbql-query venues {:limit 1}))))))))))))
