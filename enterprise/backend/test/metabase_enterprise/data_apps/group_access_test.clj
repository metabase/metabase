(ns metabase-enterprise.data-apps.group-access-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.entry-point :as entry-point]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.resources :as resources]
   [metabase.api.macros :as api.macros]
   [metabase.collections.core :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

(deftest app-list-authorizes-in-one-query-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/DataApp disabled {:name "disabled" :display_name "Disabled" :bundle_path "disabled.js"
                                          :enabled false}
                 :model/DataApp failed {:name "failed" :display_name "Failed" :bundle_path "failed.js"
                                        :sync_error "Bundle unavailable"}
                 :model/DataApp _ {:name "hidden" :display_name "Hidden" :bundle_path "hidden.js"}
                 :model/PermissionsGroup finches {}
                 :model/PermissionsGroup owls {}]
    (group-access/add-groups! app [(:id finches) (:id owls)])
    (group-access/add-groups! disabled [(:id finches)])
    (group-access/add-groups! failed [(:id finches)])
    (perms/add-user-to-group! (mt/user->id :rasta) (:id finches))
    (perms/add-user-to-group! (mt/user->id :rasta) (:id owls))
    (let [list-apps (api.macros/find-route-fn 'metabase-enterprise.data-apps.api :get "/")]
      (mt/with-current-user (mt/user->id :rasta)
        (list-apps {} {})
        (doseq [[query expected] [[{} [{:name "birds" :display_name "Birds"}
                                       {:name "disabled" :display_name "Disabled"}
                                       {:name "failed" :display_name "Failed"}]]
                                  [{:available true} [{:name "birds" :display_name "Birds"}]]]]
          (t2/with-call-count [call-count]
            (is (= expected (list-apps {} query)))
            (is (= 1 (call-count)))))))))

(deftest read-access-agrees-across-entry-points-test
  (mt/with-premium-features #{:data-apps-preview :tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant tenant {:name "Tenant"}
                     :model/User tenant-user {:tenant_id (:id tenant)}
                     :model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :bundle (.getBytes "BUNDLE" "UTF-8")}
                     :model/PermissionsGroup tenant-group {:is_tenant_group true}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
        ;; A stale assignment must not admit tenant users.
        (perms/add-user-to-group! (:id tenant-user) (:id tenant-group))
        (t2/insert! :model/DataAppGroup {:data_app_id (:id app) :permission_group_id (:id tenant-group)})
        (doseq [[user-id admin? allowed?] [[(mt/user->id :crowberto) true true]
                                           [(mt/user->id :rasta) false true]
                                           [(mt/user->id :lucky) false false]
                                           [(:id tenant-user) false false]]]
          (testing (str "read access for user " user-id)
            (is (= (if allowed? ["birds"] [])
                   (mapv :name (mt/user-http-request user-id :get 200 "apps"))))
            (mt/user-http-request user-id :get (if allowed? 200 403) "apps/birds")
            (mt/user-http-request user-id :get (if allowed? 200 403) "apps/birds/bundle")
            (mt/with-current-user user-id
              (is (= allowed? (boolean (mi/can-read? app)))))
            (let [request {:route-params {:name "birds"} :metabase-user-id user-id :is-superuser? admin?}]
              (if allowed?
                (is (true? (entry-point/check-data-app-access! request)))
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                                      (entry-point/check-data-app-access! request)))))))))))

(deftest batch-add-is-atomic-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (resources/ensure-resources! app)
    (is (thrown? clojure.lang.ExceptionInfo
                 (group-access/add-groups! app [(:id group) (:id (perms/admin-group))])))
    (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app))))))

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
                                  [:delete (str "groups/" (:id owls)) nil]]]
        (apply mt/user-http-request :rasta method 403 (str "apps/birds/" path) (when body [body]))))))

(deftest group-api-rejects-unknown-fields-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (mt/user-http-request :crowberto :post 400 "apps/birds/groups"
                            {:group_ids [(:id group)] :user_ids [(mt/user->id :rasta)]})
      (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app))))
      (is (nil? (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app)))))))

(deftest assigned-group-display-name-test
  (mt/with-premium-features #{:data-apps-preview :tenants}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (doseq [[tenants? expected-name] [[false "All Users"] [true "All internal users"]]]
        (mt/with-temporary-setting-values [use-tenants tenants?]
          (is (= [expected-name]
                 (mapv :name (mt/user-http-request :crowberto :get 200 "apps/birds/groups")))))))))

(deftest revoke-assignment-with-trashed-collection-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
      (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))]
        (mt/with-current-user (mt/user->id :crowberto)
          (collection/archive-or-unarchive-collection!
           (t2/select-one :model/Collection :id collection-id) {:archived true}))
        (mt/with-premium-features #{}
          (mt/user-http-request :crowberto :delete 204 (str "apps/birds/groups/" (:id group))))
        (is (empty? (t2/select :model/DataAppGroup :data_app_id (:id app))))
        (is (empty? (t2/select :model/Permissions :group_id (:id group)
                               :object [:in [(perms/collection-read-path collection-id)
                                             (perms/collection-readwrite-path collection-id)]])))
        (is (true? (t2/select-one-fn :archived :model/Collection :id collection-id)))
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (mi/can-read? app))))))))

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

(deftest group-list-and-revocation-after-token-expiry-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (is (= [(:id group)]
             (mapv :id (mt/user-http-request :crowberto :get 200 "apps/birds/groups"))))
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :delete 204 (str "apps/birds/groups/" (:id group)))
        (mt/user-http-request :crowberto :post 402 "apps/birds/groups" {:group_ids [(:id group)]})))))

(deftest assignment-uniqueness-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (let [assignment {:data_app_id (:id app) :permission_group_id (:id group)}]
      (t2/insert! :model/DataAppGroup assignment)
      (is (thrown? Exception (t2/insert! :model/DataAppGroup assignment))))))

(deftest revoke-assignment-after-group-becomes-ineligible-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (t2/update! :model/PermissionsGroup (:id group) {:is_tenant_group true})
      (mt/with-premium-features #{}
        (mt/user-http-request :rasta :delete 403 (str "apps/birds/groups/" (:id group)))
        (is (= [(:id group)] (mapv :id (group-access/assigned-groups app))))
        (mt/user-http-request :crowberto :delete 204 (str "apps/birds/groups/" (:id group)))
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/groups")))
        (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))]
          (is (not (t2/exists? :model/Permissions :group_id (:id group)
                               :object (perms/collection-read-path collection-id)))))))))

(deftest revoke-invalid-admin-assignment-preserves-admin-permissions-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
    (resources/ensure-resources! app)
    (let [admin-id (:id (perms/admin-group))
          permissions (t2/select :model/Permissions :group_id admin-id)]
      (t2/insert! :model/DataAppGroup {:data_app_id (:id app) :permission_group_id admin-id})
      (mt/with-premium-features #{}
        (mt/user-http-request :crowberto :delete 204 (str "apps/birds/groups/" admin-id))
        (is (= [] (mt/user-http-request :crowberto :get 200 "apps/birds/groups")))
        (is (= permissions (t2/select :model/Permissions :group_id admin-id)))))))

(deftest revoke-assignment-requires-matching-app-and-group-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/DataApp _ {:name "wrens" :display_name "Wrens" :bundle_path "wrens.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (doseq [[path status] [[(str "apps/wrens/groups/" (:id group)) 404]
                             [(str "apps/missing/groups/" (:id group)) 404]
                             ["apps/birds/groups/2147483647" 404]
                             ["apps/birds/groups/0" 400]
                             ["apps/birds/groups/not-an-id" 400]]]
        (mt/user-http-request :crowberto :delete status path))
      (is (= [(:id group)]
             (mapv :id (mt/user-http-request :crowberto :get 200 "apps/birds/groups")))))))

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
