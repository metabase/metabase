(ns metabase-enterprise.data-studio.api.collection-test
  "Tests for published tables appearing in collection items API."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest collection-items-table-test
  (mt/with-premium-features #{:library}
    (testing "GET /api/collection/:id/items"
      (mt/with-temp [:model/Collection collection                         {:type          "library-data"}
                     :model/Table      {table-id :id :as table}           {:collection_id (u/the-id collection)
                                                                           :is_published  true}
                     :model/Table      {root-table-id :id :as root-table} {:is_published  true}]
        (testing "table items appear in collection items"
          (let [items (:data (mt/user-http-request :crowberto :get 200
                                                   (str "collection/" (u/the-id collection) "/items")))]
            (is (=? [{:id          table-id
                      :name        (:display_name table)
                      :model       "table"
                      :database_id (mt/id)
                      :archived    false}]
                    (filter #(= "table" (:model %)) items)))))
        (testing "table items appear in root collection items"
          (let [items (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))]
            (is (=? [{:id          root-table-id
                      :name        (:display_name root-table)
                      :model       "table"
                      :database_id (mt/id)
                      :archived    false}]
                    (filter #(= "table" (:model %)) items)))))
        (testing "tables don't appear when archived=true"
          (let [items (mt/user-http-request :crowberto :get 200
                                            (str "collection/" (u/the-id collection) "/items")
                                            :archived true)]
            (is (empty? (filter #(= "table" (:model %)) (:data items))))))
        (testing "tables don't appear when pinned-state=is_pinned"
          (let [items (mt/user-http-request :crowberto :get 200
                                            (str "collection/" (u/the-id collection) "/items")
                                            :pinned-state "is_pinned")]
            (is (empty? (filter #(= "table" (:model %)) (:data items))))))
        (testing "tables appear when pinned-state=is_not_pinned"
          (let [items (mt/user-http-request :crowberto :get 200
                                            (str "collection/" (u/the-id collection) "/items")
                                            :pinned-state "is_not_pinned")]
            (is (= 1 (count (filter #(= "table" (:model %)) (:data items)))))))))))

(deftest collection-items-table-permissions-test
  (mt/with-premium-features #{:library}
    (testing "GET /api/collection/:id/items - published tables require view-data plus query access"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection collection {:type "library-data"}
                       :model/Table      {table-id :id :as table} {:collection_id (u/the-id collection)
                                                                   :is_published  true}
                       :model/PermissionsGroup {group-id :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (t2/delete! :model/DataPermissions :db_id (mt/id))
          (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
          (testing "with collection read but no view-data, user should not see published table"
            (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id collection) "/items")))]
              (is (empty? (filter #(= "table" (:model %)) items))
                  "User without view-data should not see published tables")))
          (testing "with collection read and view-data, user should see published table"
            (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id collection) "/items")))]
              (is (=? [{:id          table-id
                        :name        (:display_name table)
                        :model       "table"
                        :database_id (mt/id)
                        :archived    false}]
                      (filter #(= "table" (:model %)) items))
                  "User with view-data and collection access should see published tables")))
          (testing "with collection read and direct data query perms, user should still see published table"
            (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
            (data-perms/set-table-permission! group-id table :perms/create-queries :query-builder)
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id collection) "/items")))]
              (is (=? [{:id          table-id
                        :name        (:display_name table)
                        :model       "table"
                        :database_id (mt/id)
                        :archived    false}]
                      (filter #(= "table" (:model %)) items))
                  "User with both collection and data permissions should see published tables"))))))
    (testing "GET /api/collection/:id/items - without collection read permission, user should NOT see published table"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection collection {:type "library-data"}
                       :model/Table      table {:collection_id (u/the-id collection)
                                                :is_published  true}
                       :model/PermissionsGroup {group-id :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (t2/delete! :model/DataPermissions :db_id (mt/id))
          (perms/revoke-collection-permissions! (perms/all-users-group) collection)
          (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
          (data-perms/set-table-permission! group-id table :perms/create-queries :query-builder)
          (testing "user cannot access collection at all without collection permissions"
            (mt/user-http-request :rasta :get 403 (str "collection/" (u/the-id collection) "/items"))))))
    (testing "GET /api/collection/root/items - published tables in root still require view-data"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Table {table-id :id :as table} {:collection_id nil
                                                              :is_published  true}
                       :model/PermissionsGroup {group-id :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (t2/delete! :model/DataPermissions :db_id (mt/id))
          (testing "with no view-data, user should not see published table in root"
            (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
            (let [items (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))]
              (is (empty? (filter #(= table-id (:id %)) (filter #(= "table" (:model %)) items)))
                  "Users without view-data should not see published tables in root")))
          (testing "with view-data permissions, user should see published table in root"
            (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
            (let [items (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))]
              (is (=? [{:id          table-id
                        :name        (:display_name table)
                        :model       "table"
                        :database_id (mt/id)
                        :archived    false}]
                      (filter #(= table-id (:id %)) (filter #(= "table" (:model %)) items)))
                  "User with view-data should see published tables in root")))
          (testing "with direct query permissions, user should still see published table in root"
            (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
            (data-perms/set-table-permission! group-id table :perms/create-queries :query-builder)
            (let [items (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))]
              (is (=? [{:id          table-id
                        :name        (:display_name table)
                        :model       "table"
                        :database_id (mt/id)
                        :archived    false}]
                      (filter #(= table-id (:id %)) (filter #(= "table" (:model %)) items)))
                  "User with data permissions should see published tables in root"))))))))

(deftest collection-items-metadata-table-permissions-test
  (testing "The EXISTS probe behind /items/metadata and include-available-models applies the non-admin table filter"
    (mt/with-premium-features #{:library}
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection collection {:type "library-data"}
                       :model/Table      table     {:collection_id (u/the-id collection)
                                                    :is_published  true}
                       :model/Table      _         {:collection_id (u/the-id collection)
                                                    :is_published  false}
                       :model/PermissionsGroup {group-id :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
          (let [metadata-url (str "collection/" (u/the-id collection) "/items/metadata")
                items-url    (str "collection/" (u/the-id collection) "/items")
                fetch        (fn []
                               {:metadata (mt/user-http-request :rasta :get 200 metadata-url)
                                :items    (mt/user-http-request :rasta :get 200 items-url
                                                                :include-available-models true)})]
            (testing "with collection read but view-data blocked, the table is not counted"
              (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
              (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
              (let [{:keys [metadata items]} (fetch)]
                (is (= {:available_models [] :total_items 0} metadata))
                (is (= [] (:available_models items)))
                (is (= [] (:data items)))))
            (testing "with collection read and view-data, the published-via-collection grant makes the table count"
              (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
              (let [{:keys [metadata items]} (fetch)]
                (is (= {:available_models ["table"] :total_items 1} metadata))
                (is (= ["table"] (:available_models items)))
                (is (= [(u/the-id table)] (map :id (:data items))))))
            (testing "with direct query permissions as well, the table still counts exactly once"
              (data-perms/set-table-permission! group-id table :perms/create-queries :query-builder)
              (let [{:keys [metadata items]} (fetch)]
                (is (= {:available_models ["table"] :total_items 1} metadata))
                (is (= ["table"] (:available_models items)))))
            (testing "the model filter does not change what is counted"
              (is (= {:available_models ["table"] :total_items 1}
                     (mt/user-http-request :rasta :get 200 metadata-url :models "table")))
              (is (= {:available_models [] :total_items 0}
                     (mt/user-http-request :rasta :get 200 metadata-url :models "card")))))))
      (testing "GET /api/collection/root/items/metadata applies the same filter to published tables in the root"
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/Table table {:collection_id nil
                                             :is_published  true}
                         :model/PermissionsGroup {group-id :id} {}]
            (perms/add-user-to-group! (mt/user->id :rasta) group-id)
            (let [fetch (fn []
                          (mt/user-http-request :rasta :get 200 "collection/root/items/metadata" :models "table"))]
              (testing "with view-data blocked, no table is counted"
                (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
                (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
                (is (= {:available_models [] :total_items 0} (fetch))))
              (testing "with view-data on the table, it is counted"
                (data-perms/set-table-permission! group-id table :perms/view-data :unrestricted)
                (is (= ["table"] (:available_models (fetch))))
                (is (pos? (:total_items (fetch))))))))))))
