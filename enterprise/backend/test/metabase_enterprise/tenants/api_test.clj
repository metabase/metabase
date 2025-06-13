(ns metabase-enterprise.tenants.api-test
  (:require
   [clojure.test :refer [deftest testing is use-fixtures]]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn with-premium-feature-fixture [f]
  (mt/with-premium-features #{:tenants :advanced-permissions}
    (f)))

(use-fixtures :each with-premium-feature-fixture)

(deftest can-create-tenants
  (testing "I can create a tenant with a unique name"
    (mt/with-model-cleanup [:model/Tenant]
      (mt/user-http-request :crowberto :post 200 "ee/tenant/"
                            {:name "My Tenant"
                             :slug "my-tenant"})
      (is (t2/exists? :model/Tenant :name "My Tenant"))))
  (testing "Duplicate names results in an error"
    (mt/with-model-cleanup [:model/Tenant]
      (mt/user-http-request :crowberto :post 200 "ee/tenant/"
                            {:name "My Tenant" :slug "my-tenant"})
      (is (t2/exists? :model/Tenant :name "My Tenant"))
      (is (= "This tenant name or slug is already taken."
             (mt/user-http-request :crowberto :post 400 "ee/tenant/"
                                   {:name "My Tenant" :slug "foo"})))
      (is (= "This tenant name or slug is already taken."
             (mt/user-http-request :crowberto :post 400 "ee/tenant/"
                                   {:name "Foo" :slug "my-tenant"})))))
  (testing "invalid slug results in an error"
    (mt/user-http-request :crowberto :post 400 "ee/tenant/"
                          {:name "My Tenant"
                           :slug "FOOBAR"})))

(deftest can-get-tenant-info
  (mt/with-temp [:model/Tenant {id1 :id} {:name "Tenant Name" :slug "sluggy"}
                 :model/User _ {:tenant_id id1}]
    (is (= {:id id1
            :name "Tenant Name"
            :is_active true
            :slug "sluggy"
            :member_count 1}
           (mt/user-http-request :crowberto :get 200 (str "ee/tenant/" id1))))))

(deftest can-update-tenant-name
  (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Name" :slug "sluggy"}
                 :model/Tenant _ {:name "Other Name" :slug "sluggy2"}]
    (is (= {:id id
            :name "New Name"
            :slug "sluggy"
            :is_active true
            :member_count 0}
           (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:name "New Name"})))
    (is (= "This name is already taken."
           (mt/user-http-request :crowberto :put 400 (str "ee/tenant/" id) {:name "Other Name"})))))

(deftest can-mark-tenant-as-active-or-inactive
  (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Name" :slug "sluggy"}]
    (is (= {:id id
            :name "Tenant Name"
            :slug "sluggy"
            :is_active false
            :member_count 0}
           (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:is_active false})))))

(deftest can-list-tenants
  (testing "I can list tenants"
    (mt/with-temp [:model/Tenant {id1 :id} {:name "Name 1" :slug "slug-1"}
                   :model/User {} {:tenant_id id1}
                   :model/Tenant {id2 :id} {:name "Name 2" :slug "slug-2"}]
      (is (=? {:data [{:id id1 :member_count 1}
                      {:id id2 :member_count 0}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/")))
      (is (=? {:data [{:id id1 :name "Name 1" :slug "slug-1"}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?limit=1")))
      (is (=? {:data [{:id id2}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?offset=1"))))))

(deftest can-list-deactivated-tenants
  (testing "I can list deactivated tenants only"
    (mt/with-temp [:model/Tenant {id1 :id} {:name "Name 1" :slug "slug-1"}
                   :model/User {} {:tenant_id id1}
                   :model/Tenant {id2 :id} {:name "Name 2" :slug "slug-2" :is_active false}
                   :model/User {} {:tenant_id id2}]
      (is (=? {:data [{:id id1 :member_count 1}
                      {:id id2 :member_count 1}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/")))
      (is (=? {:data [{:id id1 :member_count 1}
                      {:id id2 :member_count 1}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?status=all")))
      (is (=? {:data [{:id id1 :member_count 1}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?status=active")))
      (is (=? {:data [{:id id2 :member_count 1}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?status=deactivated"))))))

(deftest tenant-users-can-only-list-tenant-recipients
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Tenant" :slug "tenant-slug"}
                 :model/Tenant {other-tenant-id :id} {:name "Other Tenant" :slug "other-tenant-slug"}
                 :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                 :model/User {other-tenant-user-id :id} {:tenant_id other-tenant-id}
                 :model/User {normal-user-id :id} {}]
    (let [get-recipient-ids (fn [user-id]
                              (->> (mt/user-http-request user-id :get 200 "user/recipients")
                                   :data
                                   (filter #(contains? #{tenant-user-id normal-user-id other-tenant-user-id} (:id %)))
                                   (map :id)
                                   (into #{})))]
      (mt/with-temporary-setting-values [user-visibility :all]
        (is (=? #{normal-user-id} (get-recipient-ids normal-user-id)))
        (is (=? #{tenant-user-id} (get-recipient-ids tenant-user-id)))
        (is (=? #{other-tenant-user-id} (get-recipient-ids other-tenant-user-id)))
        ;; note that even superusers only see recipients in the same tenant - maybe revisit this?
        (is (=? #{tenant-user-id
                  other-tenant-user-id
                  normal-user-id} (get-recipient-ids :crowberto))))
      (mt/with-temporary-setting-values [user-visibility :group]
        (is (=? #{normal-user-id} (get-recipient-ids normal-user-id)))
        (is (=? #{tenant-user-id} (get-recipient-ids tenant-user-id)))
        (is (=? #{other-tenant-user-id} (get-recipient-ids other-tenant-user-id)))
        (is (=? #{tenant-user-id
                  other-tenant-user-id
                  normal-user-id} (get-recipient-ids :crowberto))))
      (mt/with-temporary-setting-values [user-visibility :none]
        (is (=? #{normal-user-id} (get-recipient-ids normal-user-id)))
        (is (=? #{tenant-user-id} (get-recipient-ids tenant-user-id)))
        (is (=? #{other-tenant-user-id} (get-recipient-ids other-tenant-user-id)))
        (is (=? #{tenant-user-id
                  other-tenant-user-id
                  normal-user-id} (get-recipient-ids :crowberto)))))))

(deftest list-users-can-list-tenant-users
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Tenant" :slug "tenant-slug"}
                 :model/Tenant {other-tenant-id :id} {:name "Other Tenant" :slug "other-tenant-slug"}
                 :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                 :model/User {other-tenant-user-id :id} {:tenant_id other-tenant-id}
                 :model/User {normal-user-id :id} {}]
    (let [get-users (fn [& query-params]
                      (->> (mt/user-http-request :crowberto :get 200 (apply str "user?" query-params))
                           :data
                           (filter #(contains? #{tenant-user-id normal-user-id other-tenant-user-id} (:id %)))
                           (sort-by :id)))]
      (is (=? [{:id normal-user-id :tenant_id nil}] (get-users)))
      (is (=? [{:id tenant-user-id :tenant_id tenant-id}] (get-users "tenant_id=" tenant-id)))
      (is (=? [{:id other-tenant-user-id :tenant_id other-tenant-id}] (get-users "tenant_id=" other-tenant-id)))
      (is (=? [{:id normal-user-id}] (get-users "tenancy=internal")))
      (is (=? [{:id tenant-user-id}
               {:id other-tenant-user-id}
               {:id normal-user-id}]
              (get-users "tenancy=all")))
      (is (=? [{:id tenant-user-id}
               {:id other-tenant-user-id}]
              (get-users "tenancy=external")))
      (is (= "You cannot specify both `tenancy` and `tenant_id`"
             ;; even though this makes sense as a query (it's just redundant), let's just prohibit specifying both
             (mt/user-http-request :crowberto :get 400 (str "user?tenancy=external&tenant_id=" tenant-id)))))))

(deftest users-are-deactivated-with-tenants
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Tenant" :slug "tenant-slug"}
                 :model/User {user-id :id} {:tenant_id tenant-id}
                 :model/User {other-user-id :id} {:tenant_id tenant-id}]
    (let [active? (fn [user-id]
                    (t2/select-one-fn :is_active :model/User :id user-id))]
      ;; setup: deactivate "other user", do a sanity check to make sure one is active, one is not
      (mt/user-http-request :crowberto :delete 200 (str "user/" other-user-id))
      (testing "Sanity check, user starts activated"
        (is (active? user-id))
        (is (not (active? other-user-id))))
      ;; deactivate the tenant
      (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" tenant-id) {:is_active false})
      (testing "After deactivating the tenant, both users are deactivated"
        (is (not (active? user-id)))
        (is (not (active? other-user-id))))
      (testing "After deactivating the tenant, it's not possible to reactivate either user"
        (mt/user-http-request :crowberto :put 400 (str "user/" user-id "/reactivate"))
        (mt/user-http-request :crowberto :put 400 (str "user/" other-user-id "/reactivate")))
      ;; reactivate the tenant
      (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" tenant-id) {:is_active true})
      (testing "After reactivating the tenant, only one user is reactivated"
        (is (active? user-id))
        (is (not (active? other-user-id))))
      (testing "Now that the tenant is active, it's possible to reactivate a user"
        (mt/user-http-request :crowberto :put 200 (str "user/" other-user-id "/reactivate"))))))

(deftest tenant-collections-are-labeled-in-collection-items-api
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id :as parent} {:type "shared-tenant-collection"}
                     :model/Collection {coll-id :id} {:type "shared-tenant-collection"
                                                      :location (collection/children-location parent)}]
        (let [coll-item (->> (mt/user-http-request :rasta :get 200 (str "collection/" parent-id "/items"))
                             :data
                             first)]
          (is (= {:id coll-id
                  :is_tenant_collection true}
                 (select-keys coll-item [:id :is_tenant_collection]))))
        (mt/with-premium-features #{}
          (let [coll-item (->> (mt/user-http-request :rasta :get 200 (str "collection/" parent-id "/items"))
                               :data
                               first)]
            (is (nil? coll-item))))))))

(deftest can-get-tenant-collections-from-tree-api
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id :as parent} {:type "shared-tenant-collection"}
                     :model/Collection {other-rooty-id :id} {:type "shared-tenant-collection"}
                     :model/Collection {coll-id :id} {:type "shared-tenant-collection"
                                                      :location (collection/children-location parent)}
                     :model/Collection {non-tenant-coll-id :id} {}]
        (letfn [(simplify-children [children]
                  (into #{} (->> children
                                 (filter #(contains?
                                           #{parent-id other-rooty-id coll-id non-tenant-coll-id}
                                           (:id %)))
                                 (map #(-> %
                                           (select-keys [:id :children])
                                           (update :children simplify-children))))))]
          (let [res (mt/user-http-request :rasta :get 200 "collection/tree?include-tenant-collections=true")]
            (is (= #{{:id parent-id
                      :children #{{:id coll-id :children #{}}}}
                     {:id other-rooty-id
                      :children #{}}}
                   (simplify-children res))))
          (is (= #{{:id non-tenant-coll-id
                    :children #{}}}
                 (simplify-children
                  (mt/user-http-request :rasta :get 200 "collection/tree?include-tenant-collections=false"))
                 (simplify-children
                  (mt/user-http-request :rasta :get 200 "collection/tree")))))))
    (mt/with-temporary-setting-values [use-tenants false]
      (let [res (mt/user-http-request :rasta :get 200 "collection/tree?include-tenant-collections=true")]
        (is (= [] res))))))

(deftest root-collection-items-does-not-include-tenant-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id} {:type "shared-tenant-collection"}]
        (is (= []
               (->> (mt/user-http-request :rasta :get 200 "collection/root/items")
                    :data
                    (map :id)
                    (filter #(= parent-id %)))))))))

(deftest we-can-get-root-tenant-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {top-id :id :as parent} {:type "shared-tenant-collection"}
                     :model/Collection {other-top-id :id} {:type "shared-tenant-collection"}
                     :model/Collection _doesnt-appear-in-results {:type     "shared-tenant-collection"
                                                                  :location (collection/children-location parent)}]
        (is (= #{{:id top-id :is_tenant_collection true}
                 {:id other-top-id :is_tenant_collection true}}
               (->> (mt/user-http-request :rasta :get 200 "ee/tenant/collection/root/items")
                    :data
                    (map #(select-keys % [:id :is_tenant_collection]))
                    (into #{}))))))
    (mt/with-premium-features #{}
      (is (mt/user-http-request :rasta :get 402 "ee/tenant/collection/root/items")))))

(deftest admins-can-create-shared-tenant-collections-at-root-level
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-model-cleanup [:model/Collection]
        (let [{id :id} (mt/user-http-request :crowberto :post 200 "collection/" {:type "shared-tenant-collection"
                                                                                 :name (mt/random-name)})
              coll (t2/select-one :model/Collection id)]
          (is coll)
          (is (= "shared-tenant-collection" (:type coll))))))))

(deftest tenant-collections-cant-be-created-if-tenants-disabled
  (mt/with-temporary-setting-values [use-tenants false]
    (mt/user-http-request :crowberto :post 400 "collection/" {:type "shared-tenant-collection" :name (mt/random-name)})))

(defn do-with-disabled-create-tenant-collections-permissions
  [f]
  (let [current-application-permissions (t2/select (t2/table-name :model/Permissions) :object "/application/create-tenant-collections/")]
    (try
      (t2/delete! :model/Permissions :object "/application/create-tenant-collections/")
      (f)
      (finally
        (t2/delete! :model/Permissions :object "/application/create-tenant-collections/")
        (when (seq current-application-permissions)
          (t2/insert! (t2/table-name :model/Permissions) current-application-permissions))))))

(defmacro ^:private with-disabled-create-tenant-collections-permissions!
  [& body]
  `(do-with-disabled-create-tenant-collections-permissions (fn [] ~@body)))

(deftest regular-users-without-necessary-perm-cannot-create-any-shared-tenant-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (with-disabled-create-tenant-collections-permissions!
        (mt/user-http-request :rasta :post 403 "collection/" {:type "shared-tenant-collection"
                                                              :name (mt/random-name)})))))

(deftest regular-users-with-necessary-perm-can-create-shared-tenant-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (with-disabled-create-tenant-collections-permissions!
        (perms/grant-application-permissions! (perms/all-users-group) :create-tenant-collections)
        (mt/user-http-request :rasta :post 403 "collection/" {:type "shared-tenant-collection"
                                                              :name (mt/random-name)})))))

(deftest admins-can-create-shared-tenant-collections-as-children-of-other-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id} {:type "shared-tenant-collection"}]
        (let [id (:id (mt/user-http-request :crowberto :post 200 "collection/" {:type "shared-tenant-collection"
                                                                                :name (mt/random-name)
                                                                                :parent_id parent-id}))
              coll (t2/select-one :model/Collection id)]
          (is id)
          (is (= "shared-tenant-collection" (:type coll))))))))

(deftest a-child-of-a-shared-tenant-collection-must-be-a-tenant-collection
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id} {:type "shared-tenant-collection"}]
        (mt/user-http-request :crowberto :post 400 "collection/" {:name (mt/random-name)
                                                                  :parent_id parent-id})))))
