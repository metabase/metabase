(ns metabase-enterprise.data-apps.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions.block-permissions :as block-perms]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- app-group!
  [name]
  (:permission_group_id
   (data-app.resources/ensure-resources!
    (t2/insert-returning-instance! :model/DataApp
                                   {:name name :display_name name :bundle_path (str "data_apps/" name "/index.js")}))))

(defn- view-data-rows
  [group-id db-id]
  (t2/select [:model/DataPermissions :id :table_id :perm_value]
             :group_id group-id :db_id db-id :perm_type :perms/view-data))

(deftest membership-preserves-legacy-block-permission-check-test
  (mt/with-premium-features #{:advanced-permissions :data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-restored-data-perms-for-group! (:id (perms/all-users-group))
        (let [db-id (mt/id)
              provider (mt/metadata-provider)
              query (lib/query provider (lib.metadata/table provider (mt/id :venues)))
              check-block-permissions #(mt/with-test-user :rasta (block-perms/check-block-permissions query))]
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/create-queries :no)
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/view-data :legacy-no-self-service)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (perms/set-database-permission! (perms/all-users-group) db-id :perms/download-results :ten-thousand-rows)
          ;; user should not be blocked from viewing the query
          (is (true? (check-block-permissions)))
          (let [group-id (app-group! "wrens")]
            (perms/add-user-to-group! (mt/user->id :rasta) group-id)
            (is (true? (check-block-permissions)))
            (is (=? [{:table_id nil :perm_value :legacy-no-self-service}] (view-data-rows group-id db-id)))
            (testing "other groups still supply query creation and download permissions"
              (is (= :query-builder
                     (perms/table-permission-for-user (mt/user->id :rasta) :perms/create-queries
                                                      db-id (mt/id :categories))))
              (is (= :ten-thousand-rows
                     (perms/table-permission-for-user (mt/user->id :rasta) :perms/download-results
                                                      db-id (mt/id :venues)))))))))))

(deftest permission-edits-reconcile-all-app-groups-test
  (mt/with-premium-features #{:advanced-permissions :data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:db_id db-id :schema "PUBLIC"}
                     :model/PermissionsGroup {ordinary-group-id :id} {}]
        (let [group-ids [(app-group! "wrens") (app-group! "finches")]
              set-view-data! #(data-perms.graph/update-data-perms-graph!
                               {:groups {ordinary-group-id {db-id {:view-data % :create-queries :no}}}})]
          (set-view-data! :legacy-no-self-service)
          (doseq [group-id group-ids]
            (is (=? [{:table_id nil :perm_value :legacy-no-self-service}] (view-data-rows group-id db-id))))
          (testing "new tables preserve the database-wide legacy permission"
            (mt/with-temp [:model/Table {new-table-id :id} {:db_id db-id :schema "PUBLIC"}]
              (doseq [group-id group-ids]
                (is (=? [{:table_id nil :perm_value :legacy-no-self-service}] (view-data-rows group-id db-id)))
                (is (= :legacy-no-self-service
                       (perms/table-permission-for-groups #{group-id} :perms/view-data db-id new-table-id))))))
          (testing "reconciliation removes manual management grants"
            (doseq [group-id group-ids
                    perm-type [:perms/manage-table-metadata :perms/manage-database]]
              (perms/set-database-permission! group-id db-id perm-type :yes))
            (set-view-data! :legacy-no-self-service)
            (doseq [group-id group-ids]
              (is (= #{[:perms/manage-table-metadata :no] [:perms/manage-database :no]}
                     (t2/select-fn-set (juxt :perm_type :perm_value) :model/DataPermissions
                                       :group_id group-id :db_id db-id
                                       :perm_type [:in [:perms/manage-table-metadata :perms/manage-database]])))))
          (testing "an unchanged permission edit preserves row IDs"
            (let [before (mapv #(view-data-rows % db-id) group-ids)]
              (set-view-data! :legacy-no-self-service)
              (is (= before (mapv #(view-data-rows % db-id) group-ids)))))
          (testing "copied legacy does not keep itself alive after the ordinary grant is removed"
            (set-view-data! :blocked)
            (doseq [group-id group-ids]
              (is (=? [{:table_id nil :perm_value :blocked}] (view-data-rows group-id db-id)))))
          (testing "a table-level legacy grant also updates the whole database"
            (set-view-data! {"PUBLIC" {table-id :legacy-no-self-service}})
            (doseq [group-id group-ids]
              (is (=? [{:table_id nil :perm_value :legacy-no-self-service}] (view-data-rows group-id db-id))))))))))

(deftest unrelated-legacy-permissions-do-not-unblock-app-members-test
  (mt/with-premium-features #{:advanced-permissions :data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup {ordinary-group-id :id} {}]
          (perms/set-database-permission! ordinary-group-id (mt/id) :perms/view-data :legacy-no-self-service)
          (let [group-id (app-group! "finches")
                provider (mt/metadata-provider)
                query (lib/query provider (lib.metadata/table provider (mt/id :venues)))]
            (perms/add-user-to-group! (mt/user->id :rasta) group-id)
            (is (=? [{:table_id nil :perm_value :legacy-no-self-service}] (view-data-rows group-id (mt/id))))
            (is (= :blocked (perms/table-permission-for-user (mt/user->id :rasta)
                                                             :perms/view-data (mt/id) (mt/id :venues))))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You do not have permissions to run this query"
                                  (mt/with-test-user :rasta (block-perms/check-block-permissions query))))
            (testing "the app group grants no other data capabilities"
              (is (= #{[:perms/create-queries :no] [:perms/download-results :no]
                       [:perms/manage-table-metadata :no] [:perms/manage-database :no] [:perms/transforms :no]}
                     (t2/select-fn-set (juxt :perm_type :perm_value) :model/DataPermissions
                                       :group_id group-id :db_id (mt/id)
                                       :perm_type [:in [:perms/create-queries :perms/download-results
                                                        :perms/manage-table-metadata :perms/manage-database :perms/transforms]]))))))))))
