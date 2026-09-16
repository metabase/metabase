(ns metabase-enterprise.data-apps.group-access-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.entry-point :as entry-point]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.resources :as resources]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest assignments-authorize-access-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (resources/ensure-resources! app)
    (mt/with-current-user (mt/user->id :rasta)
      (is (not (mi/can-read? app))))
    (group-access/add-groups! app [(:id group)])
    (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
    (mt/with-current-user (mt/user->id :rasta)
      (is (mi/can-read? app)))
    (group-access/remove-group! app (:id group))
    (mt/with-current-user (mt/user->id :rasta)
      (is (not (mi/can-read? app))))
    (mt/with-current-user (mt/user->id :crowberto)
      (is (mi/can-read? app)))))

(deftest batch-add-is-atomic-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (resources/ensure-resources! app)
    (is (thrown? clojure.lang.ExceptionInfo
                 (group-access/add-groups! app [(:id group) (:id (perms/admin-group))])))
    (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app))))))

(deftest group-warning-does-not-depend-on-members-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
      (is (= [(:id group)]
             (mapv :group_id (group-access/permission-warnings [(mt/id :venues)] [(:id group)])))))))

(deftest group-api-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup finches {:name "Finches"}
                   :model/PermissionsGroup owls {:name "Owls"}
                   :model/PermissionsGroup tenant {:is_tenant_group true}]
      (resources/ensure-resources! app)
      (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/groups")))
      (doseq [ids [[(:id finches) (:id (perms/admin-group))]
                   [(:id finches) (:id tenant)]
                   [(:id finches) (:id finches)]
                   []
                   (vec (range 1 102))]]
        (mt/user-http-request :crowberto :post 400 "apps/birds/groups" {:group_ids ids})
        (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app)))))
      (mt/user-http-request :crowberto :post 404 "apps/birds/groups" {:group_ids [(:id finches) Integer/MAX_VALUE]})
      (is (=? [{:id (:id finches) :name "Finches" :member_count 0}
               {:id (:id owls) :name "Owls" :member_count 0}]
              (mt/user-http-request :crowberto :post 200 "apps/birds/groups"
                                    {:group_ids [(:id finches) (:id owls)]})))
      (mt/user-http-request :crowberto :post 400 "apps/birds/groups" {:group_ids [(:id finches)]})
      (mt/user-http-request :crowberto :delete 204 (str "apps/birds/groups/" (:id finches)))
      (is (= [(:id owls)] (mapv :id (mt/user-http-request :crowberto :get 200 "apps/birds/groups"))))
      (doseq [[method path body] [[:get "groups" nil]
                                  [:post "groups" {:group_ids [(:id finches)]}]
                                  [:post "group-permission-warnings" {:group_ids [(:id finches)]}]
                                  [:delete (str "groups/" (:id owls)) nil]]]
        (apply mt/user-http-request :rasta method 403 (str "apps/birds/" path) (when body [body]))))))

(deftest assignment-transaction-rolls-back-collection-failure-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (let [ensure-resources! (mt/original-fn #'resources/ensure-resources!)]
      (mt/with-dynamic-fn-redefs [resources/ensure-resources! (fn [app]
                                                                (ensure-resources! app)
                                                                (throw (ex-info "Failed after collection setup" {})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed after collection setup"
                              (group-access/add-groups! app [(:id group)])))))
    (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app))))
    (is (nil? (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))))))

(deftest assignments-preserve-data-permissions-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (let [before (t2/select :model/DataPermissions :group_id (:id group))]
      (group-access/add-groups! app [(:id group)])
      (resources/ensure-resources! app)
      (group-access/remove-group! app (:id group))
      (is (= before (t2/select :model/DataPermissions :group_id (:id group)))))))

(deftest group-deletion-cascades-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (group-access/add-groups! app [(:id group)])
    (t2/delete! :model/PermissionsGroup :id (:id group))
    (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app))))
    (is (t2/exists? :model/DataApp :id (:id app)))))

(deftest all-users-assignment-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
    (group-access/add-groups! app [(:id (perms/all-users-group))])
    (mt/with-current-user (mt/user->id :rasta)
      (is (mi/can-read? app)))))

(deftest group-warning-permission-composition-test
  (mt/with-premium-features #{:advanced-permissions :sandboxes :connection-impersonation}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup group {}]
        (let [group-id (:id group)
              table-id (mt/id :venues)
              warnings #(group-access/permission-warnings [table-id] [group-id])]
          (perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
          (is (=? [{:group_id group-id :missing_tables [{:id table-id :name "Venues" :database_id (mt/id)}]}]
                  (warnings)))
          (is (= [] (group-access/permission-warnings [] [group-id])))
          (perms/set-table-permissions! group-id :perms/view-data {table-id :unrestricted})
          (is (= [] (warnings)))
          (perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
          (perms/set-table-permissions! (perms/all-users-group) :perms/view-data {table-id :unrestricted})
          (is (= [] (warnings)))
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :blocked)
          (mt/with-temp [:model/Sandbox _ {:group_id group-id :table_id table-id}]
            (is (= [] (warnings))))
          (perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
          (mt/with-temp [:model/ConnectionImpersonation _ {:group_id group-id :db_id (mt/id)
                                                           :attribute "database_role"}]
            (is (= [] (warnings)))))))))

(deftest warning-query-count-is-bounded-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/DataApp first-app {:name "finches" :display_name "Finches" :bundle_path "a.js"
                                             :table_ids [(mt/id :venues)]}
                   :model/DataApp second-app {:name "owls" :display_name "Owls" :bundle_path "b.js"
                                              :table_ids [(mt/id :orders)]}
                   :model/PermissionsGroup group {}]
      (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
      (group-access/add-groups! first-app [(:id group)])
      (group-access/add-groups! second-app [(:id group)])
      (let [query-count (fn [apps]
                          (t2/with-call-count [calls]
                            (let [result (group-access/apps-with-permission-warnings apps)]
                              {:result result :calls (calls)})))
            one (query-count [first-app])
            two (query-count [first-app second-app])]
        (is (= #{(:id first-app)} (:result one)))
        (is (= #{(:id first-app) (:id second-app)} (:result two)))
        (is (= 3 (:calls one) (:calls two)))))))

(deftest group-list-warning-and-revocation-after-token-expiry-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :table_ids [(mt/id :venues)]}
                     :model/PermissionsGroup group {}]
        (perms/set-database-permission! (:id group) (mt/id) :perms/view-data :blocked)
        (group-access/add-groups! app [(:id group)])
        (is (true? (:has_group_permission_warnings
                    (first (mt/user-http-request :crowberto :get 200 "apps")))))
        (is (=? [{:group_id (:id group) :missing_tables [{:id (mt/id :venues)}]}]
                (mt/user-http-request :crowberto :post 200 "apps/birds/group-permission-warnings"
                                      {:group_ids [(:id group)]})))
        (mt/with-premium-features #{}
          (mt/user-http-request :crowberto :delete 204 (str "apps/birds/groups/" (:id group)))
          (mt/user-http-request :crowberto :post 402 "apps/birds/groups" {:group_ids [(:id group)]}))
        (is (false? (:has_group_permission_warnings
                     (first (mt/user-http-request :crowberto :get 200 "apps")))))))))

(deftest assignment-uniqueness-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (let [assignment {:data_app_id (:id app) :permission_group_id (:id group)}]
      (t2/insert! :model/DataAppGroup assignment)
      (is (thrown? Exception (t2/insert! :model/DataAppGroup assignment))))))

(deftest entry-point-requires-assignment-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (let [request {:route-params {:name "birds"} :metabase-user-id (mt/user->id :rasta)}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (entry-point/check-data-app-access! request)))
        (is (true? (entry-point/check-data-app-access! (assoc request :is-superuser? true))))
        (group-access/add-groups! app [(:id (perms/all-users-group))])
        (is (true? (entry-point/check-data-app-access! request)))))))

(deftest assignment-remains-canonical-after-collection-drift-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (let [group-id (:id (perms/all-users-group))]
        (group-access/add-groups! app [group-id])
        (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))]
          (perms/revoke-collection-permissions! group-id collection-id)
          (is (= {:name "birds" :display_name "Birds"}
                 (mt/user-http-request :rasta :get 200 "apps/birds"))))))))

(deftest tenant-users-cannot-inherit-app-access-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temp [:model/Tenant tenant {:name "Tenant"}
                   :model/User user {:tenant_id (:id tenant)}
                   :model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (mt/with-current-user (:id user)
        (is (not (mi/can-read? app)))))))

(deftest sso-membership-controls-assigned-app-access-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}
                 :model/User user {}]
    (group-access/add-groups! app [(:id group)])
    (sso/sync-group-memberships! (:id user) [(:id group)])
    (mt/with-current-user (:id user)
      (is (mi/can-read? app)))
    (sso/sync-group-memberships! (:id user) [])
    (mt/with-current-user (:id user)
      (is (not (mi/can-read? app))))))
