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
  (mt/with-premium-features #{:data-studio}
    (testing "GET /api/collection/:id/items"
      (mt/with-temp [:model/Collection collection                         {}
                     :model/Card       _                                  {:collection_id (u/the-id collection)
                                                                           :name          "a-card"}
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
        (testing "tables don't appear when pinned_state=is_pinned"
          (let [items (mt/user-http-request :crowberto :get 200
                                            (str "collection/" (u/the-id collection) "/items")
                                            :pinned_state "is_pinned")]
            (is (empty? (filter #(= "table" (:model %)) (:data items))))))
        (testing "tables appear when pinned_state=is_not_pinned"
          (let [items (mt/user-http-request :crowberto :get 200
                                            (str "collection/" (u/the-id collection) "/items")
                                            :pinned_state "is_not_pinned")]
            (is (= 1 (count (filter #(= "table" (:model %)) (:data items)))))))))))

(deftest collection-items-table-permissions-test
  (mt/with-premium-features #{:data-studio}
    (testing "GET /api/collection/:id/items - published tables only require collection read permissions"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection collection {}
                       :model/Table      {table-id :id :as table} {:collection_id (u/the-id collection)
                                                                   :is_published  true}
                       :model/PermissionsGroup {group-id :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (t2/delete! :model/DataPermissions :db_id (mt/id))
          (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
          (testing "with collection read but NO data permissions, user should see published table"
            (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id collection) "/items")))]
              (is (=? [{:id          table-id
                        :name        (:display_name table)
                        :model       "table"
                        :database_id (mt/id)
                        :archived    false}]
                      (filter #(= "table" (:model %)) items))
                  "User with collection read permissions should see published tables (even without data permissions)")))
          (testing "with collection read AND data permissions, user should still see published table"
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
        (mt/with-temp [:model/Collection collection {}
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
    (testing "GET /api/collection/root/items - published tables in root do NOT require data permissions"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Table {table-id :id :as table} {:collection_id nil
                                                              :is_published  true}
                       :model/PermissionsGroup {group-id :id} {}]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (t2/delete! :model/DataPermissions :db_id (mt/id))
          (testing "with NO data permissions, user should see published table in root"
            (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
            (let [items (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))]
              (is (=? [{:id          table-id
                        :name        (:display_name table)
                        :model       "table"
                        :database_id (mt/id)
                        :archived    false}]
                      (filter #(= table-id (:id %)) (filter #(= "table" (:model %)) items)))
                  "Users should see published tables in root collection (even without data permissions)")))
          (testing "with data permissions, user should still see published table in root"
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
