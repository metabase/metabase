(ns metabase-enterprise.tenants.api-test
  (:require
   [clojure.test :refer [deftest testing is use-fixtures]]
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
  (mt/with-temp [:model/Tenant {id1 :id} {:name "Tenant Name" :slug "sluggy" :attributes {"env" "test"}}
                 :model/User _ {:tenant_id id1}]
    (is (= {:id id1
            :name "Tenant Name"
            :is_active true
            :slug "sluggy"
            :member_count 1
            :attributes {:env "test"}}
           (mt/user-http-request :crowberto :get 200 (str "ee/tenant/" id1))))))

(deftest can-update-tenant-name
  (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Name" :slug "sluggy"}
                 :model/Tenant _ {:name "Other Name" :slug "sluggy2"}]
    (is (= {:id id
            :name "New Name"
            :slug "sluggy"
            :is_active true
            :member_count 0
            :attributes nil}
           (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:name "New Name"})))
    (is (= "This name is already taken."
           (mt/user-http-request :crowberto :put 400 (str "ee/tenant/" id) {:name "Other Name"})))
    (testing "Can send current name without error"
      (is (= {:id id
              :name "New Name"
              :slug "sluggy"
              :is_active true
              :member_count 0
              :attributes nil}
             (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:name "New Name"}))))))

(deftest can-mark-tenant-as-active-or-inactive
  (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Name" :slug "sluggy"}]
    (is (= {:id id
            :name "Tenant Name"
            :slug "sluggy"
            :is_active false
            :attributes nil
            :member_count 0}
           (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:is_active false})))))

(deftest can-list-tenants
  (testing "I can list tenants"
    (mt/with-temp [:model/Tenant {id1 :id} {:name "Name 1" :slug "slug-1" :attributes {"env" "prod"}}
                   :model/User {} {:tenant_id id1}
                   :model/Tenant {id2 :id} {:name "Name 2" :slug "slug-2" :attributes {"env" "dev"}}]
      (is (=? {:data [{:id id1 :member_count 1 :attributes {:env "prod"}}
                      {:id id2 :member_count 0 :attributes {:env "dev"}}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/")))
      (is (=? {:data [{:id id1 :name "Name 1" :slug "slug-1" :attributes {:env "prod"}}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?limit=1")))
      (is (=? {:data [{:id id2 :attributes {:env "dev"}}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?offset=1"))))))

(deftest can-list-deactivated-tenants
  (testing "I can list deactivated tenants only"
    (mt/with-temp [:model/Tenant {id1 :id} {:name "Name 1" :slug "slug-1" :attributes {"status" "active"}}
                   :model/User {} {:tenant_id id1}
                   :model/Tenant {id2 :id} {:name "Name 2" :slug "slug-2" :is_active false :attributes {"status" "inactive"}}
                   :model/User {} {:tenant_id id2}]
      (is (=? {:data [{:id id1 :member_count 1 :attributes {:status "active"}}
                      {:id id2 :member_count 1 :attributes {:status "inactive"}}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/")))
      (is (=? {:data [{:id id1 :member_count 1 :attributes {:status "active"}}
                      {:id id2 :member_count 1 :attributes {:status "inactive"}}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?status=all")))
      (is (=? {:data [{:id id1 :member_count 1 :attributes {:status "active"}}]}
              (mt/user-http-request :crowberto :get 200 "ee/tenant/?status=active")))
      (is (=? {:data [{:id id2 :member_count 1 :attributes {:status "inactive"}}]}
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

(deftest can-create-tenant-with-attributes
  (testing "Can create tenant with valid attributes"
    (mt/with-model-cleanup [:model/Tenant]
      (let [tenant-data {:name "Tenant with Attributes"
                         :slug "tenant-attrs"
                         :attributes {"key1" "value1"
                                      "key2" "value2"
                                      "environment" "production"}}]
        (mt/user-http-request :crowberto :post 200 "ee/tenant/" tenant-data)
        (let [created-tenant (t2/select-one :model/Tenant :name "Tenant with Attributes")]
          (is (some? created-tenant))
          (is (= {"key1" "value1"
                  "key2" "value2"
                  "environment" "production"}
                 (:attributes created-tenant)))))))

  (testing "Can create tenant with keyword attributes (converted to strings)"
    (mt/with-model-cleanup [:model/Tenant]
      (let [tenant-data {:name "Tenant with Keyword Attrs"
                         :slug "tenant-kw-attrs"
                         :attributes {:region "us-east"
                                      :tier "premium"}}]
        (mt/user-http-request :crowberto :post 200 "ee/tenant/" tenant-data)
        (let [created-tenant (t2/select-one :model/Tenant :name "Tenant with Keyword Attrs")]
          (is (some? created-tenant))
          ;; Keywords are converted to strings in the JSON storage
          (is (= {"region" "us-east"
                  "tier" "premium"}
                 (:attributes created-tenant)))))))

  (testing "Cannot create tenant with attributes starting with @"
    (mt/with-model-cleanup [:model/Tenant]
      (let [tenant-data {:name "Invalid Tenant"
                         :slug "invalid-tenant"
                         :attributes {"@system" "value"
                                      "valid-key" "value"}}
            response (mt/user-http-request :crowberto :post 400 "ee/tenant/" tenant-data)]
        (is (contains? (:errors response) :attributes))
        (is (contains? (:specific-errors response) :attributes))
        (is (contains? (get-in response [:specific-errors :attributes]) (keyword "@system")))))))

(deftest can-update-tenant-attributes
  (testing "Can update tenant attributes via PUT"
    (mt/with-temp [:model/Tenant {id :id} {:name "Test Tenant"
                                           :slug "test-tenant"
                                           :attributes {"initial" "value"}}]
      (let [updated-attrs {"updated" "new-value"
                           "environment" "staging"}
            response (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id)
                                           {:attributes updated-attrs})]
        (is (= updated-attrs (:attributes (t2/select-one :model/Tenant :id id))))
        (is (= {:id id
                :name "Test Tenant"
                :slug "test-tenant"
                :is_active true
                :member_count 0}
               (dissoc response :attributes))))))

  (testing "Can update extisting attributes"
    (mt/with-temp [:model/Tenant {id :id} {:name "Test Tenant 2"
                                           :slug "test-tenant-2"
                                           :attributes {"existing" "value"}}]
      (let [new-attrs {"existing" "value2"
                       "new-key" "new-value"}]
        (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id)
                              {:attributes new-attrs})
        (is (= new-attrs (:attributes (t2/select-one :model/Tenant :id id)))))))

  (testing "Can clear attributes by setting to empty map"
    (mt/with-temp [:model/Tenant {id :id} {:name "Test Tenant 3"
                                           :slug "test-tenant-3"
                                           :attributes {"to-be" "cleared"}}]
      (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id)
                            {:attributes {}})
      (is (= {} (:attributes (t2/select-one :model/Tenant :id id))))))

  (testing "Cannot update with attributes starting with @"
    (mt/with-temp [:model/Tenant {id :id} {:name "Test Tenant 4"
                                           :slug "test-tenant-4"
                                           :attributes {"valid" "value"}}]
      (let [invalid-attrs {"@system" "value"
                           "valid-key" "value"}
            response (mt/user-http-request :crowberto :put 400 (str "ee/tenant/" id)
                                           {:attributes invalid-attrs})]
        (is (contains? (:errors response) :attributes))
        (is (contains? (:specific-errors response) :attributes))
        (is (contains? (get-in response [:specific-errors :attributes]) (keyword "@system")))
        ;; Original attributes should remain unchanged
        (is (= {"valid" "value"} (:attributes (t2/select-one :model/Tenant :id id))))))))
