(ns metabase-enterprise.data-studio.api.query-metadata-test
  "Tests for published table query_metadata API access via collection permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest table-query-metadata-collection-permissions-test
  (mt/with-premium-features #{:data-studio}
    (testing "GET /api/table/:id/query_metadata"
      (testing "Published tables in collections should be accessible with collection read permission (no data permissions)"
        (mt/with-temp [:model/Collection coll     {}
                       :model/Database db         {}
                       :model/Table    table      {:db_id (u/the-id db) :is_published true :collection_id (u/the-id coll)}
                       :model/Field    _field-1   {:table_id (u/the-id table) :name "id" :base_type :type/Integer :semantic_type :type/PK}
                       :model/Field    _field-2   {:table_id (u/the-id table) :name "name" :base_type :type/Text}
                       :model/PermissionsGroup {group-id :id} {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
          (mt/with-no-data-perms-for-all-users!
            (perms/grant-collection-read-permissions! group-id (u/the-id coll))
            (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (u/the-id table)))]
              (is (some? response))
              (is (= (u/the-id table) (:id response)))
              (is (= 2 (count (:fields response)))))))))))

(deftest table-query-metadata-collection-permissions-test-2
  (mt/with-premium-features #{:data-studio}
    (testing "GET /api/table/:id/query_metadata"
      (testing "Published tables in root collection should be accessible with root collection read permission"
        (mt/with-temp [:model/Database db         {}
                       :model/Table    table      {:db_id (u/the-id db) :is_published true :collection_id nil}
                       :model/Field    _field-1   {:table_id (u/the-id table) :name "id" :base_type :type/Integer :semantic_type :type/PK}
                       :model/PermissionsGroup {group-id :id} {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
          (mt/with-no-data-perms-for-all-users!
            (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (u/the-id table)))]
              (is (some? response))
              (is (= (u/the-id table) (:id response))))))))))

(deftest table-query-metadata-collection-permissions-test-3
  (mt/with-premium-features #{:data-studio}
    (testing "GET /api/table/:id/query_metadata"
      (testing "Unpublished tables require data permissions"
        (mt/with-temp [:model/Database db         {}
                       :model/Table    table      {:db_id (u/the-id db) :is_published false}
                       :model/Field    _field-1   {:table_id (u/the-id table) :name "id" :base_type :type/Integer :semantic_type :type/PK}
                       :model/PermissionsGroup {group-id :id} {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
          (mt/with-no-data-perms-for-all-users!
            (testing "User without data permissions cannot access unpublished tables"
              (data-perms/set-database-permission! group-id db :perms/view-data :blocked)
              (data-perms/set-database-permission! group-id db :perms/create-queries :no)
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 (format "table/%d/query_metadata" (u/the-id table))))))
            (testing "Data permissions ARE required for unpublished tables"
              (data-perms/set-database-permission! group-id db :perms/view-data :unrestricted)
              (data-perms/set-database-permission! group-id db :perms/create-queries :query-builder)
              (let [response (mt/user-http-request :rasta :get 200 (format "table/%d/query_metadata" (u/the-id table)))]
                (is (some? response))
                (is (= (u/the-id table) (:id response)))))))))))

(deftest card-query-metadata-published-table-collection-perms-test
  (testing "GET /api/card/:id/query_metadata should include published tables accessible via collection permissions"
    (mt/with-premium-features #{:data-studio}
      (mt/with-temp [:model/Collection table-coll {}
                     :model/Database db {}
                     :model/Table table {:db_id (u/the-id db) :is_published true :collection_id (u/the-id table-coll)}
                     :model/Field _field {:table_id (u/the-id table) :name "id" :base_type :type/Integer :semantic_type :type/PK}
                     :model/Collection card-coll {}
                     :model/Card card {:collection_id (u/the-id card-coll)
                                       :dataset_query {:database (u/the-id db)
                                                       :type :query
                                                       :query {:source-table (u/the-id table)}}}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! group-id db :perms/view-data :blocked)
          (data-perms/set-database-permission! group-id db :perms/create-queries :no)
          (perms/grant-collection-read-permissions! group-id (u/the-id table-coll))
          (perms/grant-collection-read-permissions! group-id (u/the-id card-coll))
          (testing "User with collection read (no data perms) can access card query_metadata with published table"
            (let [metadata (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card) "/query_metadata"))]
              (is (map? metadata))
              (is (seq (:tables metadata)) "Should include tables")
              (is (some #(= (u/the-id table) (:id %)) (:tables metadata))
                  "Should include the published table"))))))))

(deftest dashboard-query-metadata-published-table-collection-perms-test
  (testing "GET /api/dashboard/:id/query_metadata should include published tables accessible via collection permissions"
    (mt/with-premium-features #{:data-studio}
      (mt/with-temp [:model/Collection table-coll {}
                     :model/Database db {}
                     :model/Table table {:db_id (u/the-id db) :is_published true :collection_id (u/the-id table-coll)}
                     :model/Field _field {:table_id (u/the-id table) :name "id" :base_type :type/Integer :semantic_type :type/PK}
                     :model/Collection card-coll {}
                     :model/Card card {:collection_id (u/the-id card-coll)
                                       :dataset_query {:database (u/the-id db)
                                                       :type :query
                                                       :query {:source-table (u/the-id table)}}}
                     :model/Dashboard dash {:collection_id (u/the-id card-coll)}
                     :model/DashboardCard _ {:dashboard_id (u/the-id dash) :card_id (u/the-id card)}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
        (mt/with-no-data-perms-for-all-users!
          (data-perms/set-database-permission! group-id db :perms/view-data :blocked)
          (data-perms/set-database-permission! group-id db :perms/create-queries :no)
          (perms/grant-collection-read-permissions! group-id (u/the-id table-coll))
          (perms/grant-collection-read-permissions! group-id (u/the-id card-coll))
          (testing "User with collection read (no data perms) can access dashboard query_metadata with published table"
            (let [metadata (mt/user-http-request :rasta :get 200 (str "dashboard/" (u/the-id dash) "/query_metadata"))]
              (is (map? metadata))
              (is (seq (:tables metadata)) "Should include tables")
              (is (some #(= (u/the-id table) (:id %)) (:tables metadata))
                  "Should include the published table"))))))))

(deftest automagic-dashboards-query-metadata-published-table-collection-perms-test
  (testing "GET /api/automagic-dashboards/:entity/:entity-id-or-query/query_metadata"
    (testing "Should include published tables accessible via collection permissions"
      (mt/with-premium-features #{:data-studio}
        (mt/with-temp [:model/Collection table-coll {}
                       :model/Table table {:is_published true :collection_id (u/the-id table-coll)}
                       :model/PermissionsGroup custom-group {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                            :group_id (u/the-id custom-group)}]
          (perms/set-database-permission! custom-group (mt/id) :perms/view-data :blocked)
          (perms/grant-collection-read-permissions! custom-group (u/the-id table-coll))
          (is (=? {:tables [{:id (u/the-id table)}]}
                  (mt/user-http-request :rasta :get 200 (str "automagic-dashboards/table/" (u/the-id table) "/query_metadata")))))))))
