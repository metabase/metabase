(ns metabase-enterprise.data-apps.group-access-warnings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest group-permission-warnings-ignore-unassigned-groups-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp _app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                          :table_ids [(mt/id :venues) (mt/id :orders)]}
                     :model/PermissionsGroup group {}]
        (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))))))

(deftest group-permission-warnings-include-inherited-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues) (mt/id :orders)]}
                     :model/PermissionsGroup group {}]
        (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
        (group-access/add-groups! app [(:id group)])
        (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
        (is (=? [{:group_id (:id group)
                  :missing_tables [{:id (mt/id :orders) :name "Orders" :database_id (mt/id)}]}]
                (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))))))

(deftest group-permission-warnings-preserve-permissions-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues) (mt/id :orders)]}
                     :model/PermissionsGroup group {}]
        (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
        (group-access/add-groups! app [(:id group)])
        (let [before (t2/select :model/DataPermissions)]
          (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")
          (is (= before (t2/select :model/DataPermissions))))))))

(deftest group-permission-warnings-include-direct-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues) (mt/id :orders)]}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
        (perms/set-table-permission! (:id group) (mt/id :venues) :perms/view-data :unrestricted)
        (perms/set-table-permission! (:id group) (mt/id :orders) :perms/view-data :unrestricted)
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))))))

(deftest group-permission-warnings-include-sandbox-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues) (mt/id :orders)]}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (mt/user-http-request :crowberto :put 200 "permissions/graph"
                              (-> (data-perms.graph/api-graph)
                                  (assoc-in [:groups (:id group) (mt/id) :view-data]
                                            {"PUBLIC" {(mt/id :venues) :unrestricted
                                                       (mt/id :orders) :sandboxed}})
                                  (assoc :sandboxes [{:group_id (:id group) :table_id (mt/id :orders)}])))
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))
        (mt/user-http-request :crowberto :put 200 "permissions/graph"
                              (assoc-in (data-perms.graph/api-graph)
                                        [:groups (:id group) (mt/id) :view-data "PUBLIC" (mt/id :orders)]
                                        :blocked))
        (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :orders)}]}]
                (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))))))

(deftest group-permission-warnings-require-admin-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues) (mt/id :orders)]}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (mt/user-http-request :rasta :get 403 "apps/birds/group-permission-warnings")))))

(deftest group-permission-warnings-without-dependencies-test
  (mt/with-premium-features #{:data-apps :advanced-permissions :sandboxes}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids []}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))))))

(deftest group-permission-warnings-missing-app-test
  (mt/with-premium-features #{:data-apps}
    (mt/user-http-request :crowberto :get 404 "apps/missing/group-permission-warnings")))

(deftest group-permission-warnings-use-group-access-not-memberships-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues)]}
                     :model/PermissionsGroup group {}
                     :model/PermissionsGroup other-group {}]
        (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
        (perms/set-database-permission! (:id other-group) (mt/id) :perms/view-data :unrestricted)
        (group-access/add-groups! app [(:id group)])
        (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
        (perms/add-user-to-group! (mt/user->id :rasta) (:id other-group))
        (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :venues)}]}]
                (group-access/permission-warnings app)))))))

(deftest group-permission-warnings-include-impersonated-access-test
  (mt/with-premium-features #{:data-apps :advanced-permissions}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues)]}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (mt/user-http-request :crowberto :put 200 "permissions/graph"
                              (-> (data-perms.graph/api-graph)
                                  (assoc-in [:groups (:id group) (mt/id) :view-data] :impersonated)
                                  (assoc :impersonations [{:group_id (:id group) :db_id (mt/id)
                                                           :attribute "role"}])))
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))
        (mt/user-http-request :crowberto :put 200 "permissions/graph"
                              (assoc-in (data-perms.graph/api-graph)
                                        [:groups (:id group) (mt/id) :view-data]
                                        :blocked))
        (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :venues)}]}]
                (mt/user-http-request :crowberto :get 200 "apps/birds/group-permission-warnings")))))))

(deftest group-permission-warning-lookups-are-batched-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                       :table_ids [(mt/id :venues) (mt/id :orders)]}
                   :model/PermissionsGroup finches {}
                   :model/PermissionsGroup owls {}]
      (group-access/add-groups! app [(:id finches)])
      (group-access/permission-warnings app)
      (let [query-count #(t2/with-call-count [calls]
                           (group-access/permission-warnings app)
                           (calls))
            one-group-count (query-count)]
        (group-access/add-groups! app [(:id owls)])
        (is (= one-group-count (query-count)))))))

(deftest group-permission-warnings-require-feature-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                     :table_ids [(mt/id :venues)]}
                 :model/PermissionsGroup group {}]
    (group-access/add-groups! app [(:id group)])
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 402 "apps/birds/group-permission-warnings")
      (mt/user-http-request :rasta :get 402 "apps/birds/group-permission-warnings"))))

(deftest group-permission-warning-lookups-exclude-unrelated-permissions-test
  (mt/with-temp [:model/Database other-db {}
                 :model/PermissionsGroup finches {}
                 :model/PermissionsGroup owls {}
                 :model/PermissionsGroup sparrows {}]
    (t2/delete! :model/DataPermissions :group_id [:in [(:id finches) (:id owls) (:id sparrows)]])
    (let [table-permission {:group_id (:id finches) :db_id (mt/id) :table_id (mt/id :venues)
                            :perm_type :perms/view-data :perm_value :unrestricted}
          database-permission {:group_id (:id owls) :db_id (mt/id) :table_id nil
                               :perm_type :perms/view-data :perm_value :unrestricted}]
      (t2/insert! :model/DataPermissions
                  [table-permission
                   database-permission
                   (assoc table-permission :table_id (mt/id :orders))
                   (assoc table-permission :perm_type :perms/create-queries :perm_value :query-builder)
                   (assoc database-permission :group_id (:id sparrows))
                   (assoc database-permission :db_id (:id other-db))])
      (let [access (#'group-access/group-table-access
                    #{(:id finches) (:id owls)}
                    [{:id (mt/id :venues) :database_id (mt/id)}])
            permission-rows (mapcat val (:permissions access))]
        ;; exclude loading permission rows that the data access warning check does not need
        (is (= #{table-permission database-permission}
               (into #{} (map #(select-keys % (keys table-permission))) permission-rows)))))))
