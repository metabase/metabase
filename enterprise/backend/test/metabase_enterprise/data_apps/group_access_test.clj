(ns metabase-enterprise.data-apps.group-access-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.collections.core :as collection]
   [metabase.data-apps.core :as data-apps]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.sso.core :as sso]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- access-group-ids [app]
  (into #{} (map :id) (group-access/assigned-groups app)))

(deftest visible-data-app-filter-select-outside-toucan-test
  (testing "the read rule query works in an app-DB query compiled outside Toucan, as the search index's queries are"
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp {app-id :id} {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                     :model/DataApp _ {:name "owls" :display_name "Owls" :bundle_path "owls.js"}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
        (group-access/add-groups! (t2/select-one :model/DataApp :id app-id) [group-id])
        (is (= [app-id]
               (map :id (mdb/query {:select [:id]
                                    :from   [:data_app]
                                    :where  [:in :id (data-apps/visible-data-app-filter-select
                                                      {:user-id (mt/user->id :rasta) :is-superuser? false})]}))))))))

(deftest added-groups-authorize-access-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
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
        (is (mi/can-read? app))
        (testing "without the data apps feature nobody can read an app, admins included"
          (mt/with-premium-features #{}
            (is (not (mi/can-read? app)))))))))

(deftest app-list-filters-readable-apps-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/DataApp disabled {:name "disabled" :display_name "Disabled" :bundle_path "disabled.js"
                                            :enabled false}
                   :model/DataApp _ {:name "hidden" :display_name "Hidden" :bundle_path "hidden.js"}
                   :model/PermissionsGroup finches {}
                   :model/PermissionsGroup owls {}]
      (group-access/add-groups! app [(:id finches) (:id owls)])
      (group-access/add-groups! disabled [(:id finches)])
      (perms/add-user-to-group! (mt/user->id :rasta) (:id finches))
      (perms/add-user-to-group! (mt/user->id :rasta) (:id owls))
      (let [list-apps (api.macros/find-route-fn 'metabase-enterprise.data-apps.api :get "/")]
        (mt/with-current-user (mt/user->id :rasta)
          (list-apps {} {})
          (testing "a disabled app isn't listed to a non-superuser"
            (is (= [{:id (:id app) :name "birds" :display_name "Birds" :enabled true :outdated false}]
                   (list-apps {} {})))))))))

(deftest read-access-agrees-across-entry-points-test
  (mt/with-premium-features #{:data-apps :tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant tenant {:name "Tenant"}
                     :model/User tenant-user {:tenant_id (:id tenant)}
                     :model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"
                                         :bundle (.getBytes "BUNDLE" "UTF-8")}
                     :model/PermissionsGroup group {}]
        (group-access/add-groups! app [(:id group)])
        (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
        (doseq [[user-id admin? allowed?] [[(mt/user->id :crowberto) true true]
                                           [(mt/user->id :rasta) false true]
                                           [(mt/user->id :lucky) false false]
                                           [(:id tenant-user) false false]]]
          (testing (str "read access for user " user-id)
            (is (= (if allowed? ["birds"] [])
                   (mapv :name (mt/user-http-request user-id :get 200 "ee/apps"))))
            (mt/user-http-request user-id :get (if allowed? 200 403) "ee/apps/birds")
            (mt/user-http-request user-id :get (if allowed? 200 403) "ee/apps/birds/bundle")
            (mt/with-current-user user-id
              (is (= allowed? (boolean (mi/can-read? app)))))
            (is (= allowed? (contains? (t2/select-pks-set :model/DataApp
                                                          {:where [:in :id (data-apps/visible-data-app-filter-select
                                                                            {:user-id user-id :is-superuser? admin?})]})
                                       (:id app))))))))))

(deftest group-api-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup finches {:name "Finches"}
                   :model/PermissionsGroup owls {:name "Owls"}
                   :model/PermissionsGroup tenant {:is_tenant_group true}]
      (is (= [] (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups")))
      (doseq [ids [[(:id finches) (:id (perms/admin-group))]
                   [(:id finches) (:id tenant)]
                   []
                   (vec (range 1 102))]]
        (mt/user-http-request :crowberto :post 400 "ee/apps/birds/groups" {:group_ids ids})
        (is (empty? (access-group-ids app))))
      (mt/user-http-request :crowberto :post 404 "ee/apps/birds/groups" {:group_ids [(:id finches) Integer/MAX_VALUE]})
      (is (=? [{:id (:id finches) :name "Finches" :member_count 0}
               {:id (:id owls) :name "Owls" :member_count 0}]
              (mt/user-http-request :crowberto :post 200 "ee/apps/birds/groups"
                                    {:group_ids [(:id finches) (:id finches) (:id owls)]})))
      (is (= #{(:id finches) (:id owls)} (access-group-ids app)))
      (is (= #{(perms/collection-read-path (:resource_collection_id app))}
             (t2/select-fn-set :object :model/Permissions :group_id (:id finches))))
      (mt/user-http-request :crowberto :post 400 "ee/apps/birds/groups" {:group_ids [(:id finches)]})
      (mt/user-http-request :crowberto :delete 204 (str "ee/apps/birds/groups/" (:id finches)))
      (is (= [(:id owls)] (mapv :id (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups"))))
      (doseq [[method path body] [[:get "groups" nil]
                                  [:post "groups" {:group_ids [(:id finches)]}]
                                  [:delete (str "groups/" (:id owls)) nil]]]
        (apply mt/user-http-request :rasta method 403 (str "ee/apps/birds/" path) (when body [body]))))))

(deftest group-api-ignores-unknown-fields-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}
                   :model/PermissionsGroup ignored-group {}]
      (is (=? [{:id (:id group)}]
              (mt/user-http-request :crowberto :post 200 "ee/apps/birds/groups"
                                    {:group_ids [(:id group)]
                                     :user_ids [(mt/user->id :rasta)]
                                     :permission_group_ids [(:id ignored-group)]})))
      (is (= #{(:id group)} (access-group-ids app)))
      (mt/with-current-user (mt/user->id :rasta)
        (is (not (mi/can-read? app)))))))

(deftest group-access-without-collection-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (t2/delete! :model/Collection :id (:resource_collection_id app))
      (testing "an app without a collection lists no groups, and grants none without creating one"
        (is (= [] (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups")))
        (mt/user-http-request :crowberto :post 404 "ee/apps/birds/groups" {:group_ids [(:id group)]})
        (mt/user-http-request :crowberto :delete 404 (str "ee/apps/birds/groups/" (:id group)))
        (is (nil? (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))))))))

(deftest group-with-access-display-name-test
  (mt/with-premium-features #{:data-apps :tenants}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (doseq [[tenants? expected-name] [[false "All Users"] [true "All internal users"]]]
        (mt/with-temporary-setting-values [use-tenants tenants?]
          (is (= [expected-name]
                 (mapv :name (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups")))))))))

(deftest remove-group-with-trashed-collection-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (perms/add-user-to-group! (mt/user->id :rasta) (:id group))
      (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-dynamic-fn-redefs [perms/data-app-collection? (constantly false)]
            (collection/archive-or-unarchive-collection!
             (t2/select-one :model/Collection :id collection-id) {:archived true})))
        (mt/user-http-request :crowberto :delete 204 (str "ee/apps/birds/groups/" (:id group)))
        (is (empty? (access-group-ids app)))
        (is (empty? (t2/select :model/Permissions :group_id (:id group)
                               :object [:in [(perms/collection-read-path collection-id)
                                             (perms/collection-readwrite-path collection-id)]])))
        (is (true? (t2/select-one-fn :archived :model/Collection :id collection-id)))
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (mi/can-read? app))))))))

(deftest add-groups-rolls-back-grant-failure-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}
                 :model/PermissionsGroup failing-group {}]
    (let [grant! (mt/original-fn #'perms/grant-collection-read-permissions!)]
      (mt/with-dynamic-fn-redefs [perms/grant-collection-read-permissions!
                                  (fn [group-id collection]
                                    (when (= group-id (:id failing-group))
                                      (throw (ex-info "Failed after granting collection access" {})))
                                    (grant! group-id collection))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Failed after granting collection access"
                              (group-access/add-groups! app [(:id group) (:id failing-group)]))))
      (is (empty? (access-group-ids app))))))

(deftest group-access-preserves-data-permissions-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (perms/set-database-permission! (:id group) (mt/id) :perms/create-queries :query-builder-and-native)
    (let [before (t2/select :model/DataPermissions :group_id (:id group))]
      (testing "adding a group preserves existing data permissions"
        (group-access/add-groups! app [(:id group)])
        (is (= before (t2/select :model/DataPermissions :group_id (:id group)))))
      (testing "removal preserves existing data permissions"
        (group-access/remove-group! app (:id group))
        (is (= before (t2/select :model/DataPermissions :group_id (:id group))))))))

(deftest group-deletion-cascades-test
  (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                 :model/PermissionsGroup group {}]
    (group-access/add-groups! app [(:id group)])
    (t2/delete! :model/PermissionsGroup :id (:id group))
    (is (empty? (access-group-ids app)))
    (is (t2/exists? :model/DataApp :id (:id app)))))

(deftest all-users-access-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (mt/with-current-user (mt/user->id :rasta)
        (is (mi/can-read? app))))))

(deftest disabled-app-access-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js" :enabled false}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (testing "a superuser reaches a disabled app"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (mi/can-read? app))))
      (testing "a user with group access does not reach it"
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (mi/can-read? app))))))))

(deftest group-endpoints-require-feature-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))]
        (mt/with-premium-features #{}
          (mt/user-http-request :crowberto :get 402 "ee/apps")
          (mt/user-http-request :crowberto :get 402 "ee/apps/birds/groups")
          (mt/user-http-request :crowberto :post 402 "ee/apps/birds/groups" {:group_ids [(:id group)]})
          (mt/user-http-request :crowberto :delete 402 (str "ee/apps/birds/groups/" (:id group)))
          (is (= #{(:id group)} (access-group-ids app)))
          (is (t2/exists? :model/Permissions :group_id (:id group)
                          :object (perms/collection-read-path collection-id))))))))

(deftest remove-group-after-it-becomes-ineligible-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (t2/update! :model/PermissionsGroup (:id group) {:is_tenant_group true})
      (mt/user-http-request :rasta :delete 403 (str "ee/apps/birds/groups/" (:id group)))
      (is (= [(:id group)] (mapv :id (group-access/assigned-groups app))))
      (mt/user-http-request :crowberto :delete 204 (str "ee/apps/birds/groups/" (:id group)))
      (is (= [] (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups")))
      (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app))]
        (is (not (t2/exists? :model/Permissions :group_id (:id group)
                             :object (perms/collection-read-path collection-id))))))))

(deftest admin-group-is-never-listed-or-revoked-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (let [admin-id    (:id (perms/admin-group))
            permissions (t2/select :model/Permissions :group_id admin-id)]
        (is (= [] (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups")))
        (mt/user-http-request :crowberto :delete 404 (str "ee/apps/birds/groups/" admin-id))
        (is (= permissions (t2/select :model/Permissions :group_id admin-id)))
        (mt/with-current-user (mt/user->id :crowberto)
          (is (mi/can-read? app)))))))

(deftest remove-group-requires-matching-app-and-group-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/DataApp _ {:name "wrens" :display_name "Wrens" :bundle_path "wrens.js"}
                   :model/PermissionsGroup group {}]
      (group-access/add-groups! app [(:id group)])
      (doseq [[path status] [[(str "ee/apps/wrens/groups/" (:id group)) 404]
                             [(str "ee/apps/missing/groups/" (:id group)) 404]
                             ["ee/apps/birds/groups/2147483647" 404]
                             ["ee/apps/birds/groups/0" 400]
                             ["ee/apps/birds/groups/not-an-id" 400]]]
        (mt/user-http-request :crowberto :delete status path))
      (is (= [(:id group)]
             (mapv :id (mt/user-http-request :crowberto :get 200 "ee/apps/birds/groups")))))))

(deftest collection-grants-are-the-app-access-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (let [group-id      (:id (perms/all-users-group))
            collection-id (:resource_collection_id app)]
        (testing "a grant made on the collection is listed and admits the group's members"
          (perms/grant-collection-read-permissions! group-id collection-id)
          (is (= #{group-id} (access-group-ids app)))
          (is (= {:id (:id app) :name "birds" :display_name "Birds" :enabled true :outdated false}
                 (mt/user-http-request :rasta :get 200 "ee/apps/birds"))))))))

(deftest tenant-users-cannot-inherit-app-access-test
  (mt/with-premium-features #{:data-apps :tenants}
    (mt/with-temp [:model/Tenant tenant {:name "Tenant"}
                   :model/User user {:tenant_id (:id tenant)}
                   :model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (mt/with-current-user (:id user)
        (is (not (mi/can-read? app)))))))

(deftest sso-membership-controls-app-access-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "birds" :display_name "Birds" :bundle_path "birds.js"}
                   :model/PermissionsGroup group {}
                   :model/User user {}]
      (group-access/add-groups! app [(:id group)])
      (sso/sync-group-memberships! (:id user) [(:id group)])
      (mt/with-current-user (:id user)
        (is (mi/can-read? app)))
      (sso/sync-group-memberships! (:id user) [])
      (mt/with-current-user (:id user)
        (is (not (mi/can-read? app)))))))
