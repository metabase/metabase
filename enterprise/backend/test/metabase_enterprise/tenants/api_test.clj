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

(deftest can-create-tenant-with-unique-name-test
  (testing "I can create a tenant with a unique name"
    (mt/with-model-cleanup [:model/Tenant]
      (mt/user-http-request :crowberto :post 200 "ee/tenant/"
                            {:name "My Tenant"
                             :slug "my-tenant"})
      (is (t2/exists? :model/Tenant :name "My Tenant")))))

(deftest duplicate-tenant-names-error-test
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
                                   {:name "Foo" :slug "my-tenant"}))))))

(deftest invalid-tenant-slug-error-test
  (testing "invalid slug results in an error"
    (mt/user-http-request :crowberto :post 400 "ee/tenant/"
                          {:name "My Tenant"
                           :slug "FOOBAR"})))

(deftest can-get-tenant-info
  (mt/with-temp [:model/Tenant {id1 :id} {:name "Tenant Name" :slug "sluggy" :attributes {"env" "test"}}
                 :model/User _ {:tenant_id id1}]
    (is (=? {:id id1
             :name "Tenant Name"
             :is_active true
             :slug "sluggy"
             :member_count 1
             :attributes {:env "test"}
             :tenant_collection_id integer?}
            (mt/user-http-request :crowberto :get 200 (str "ee/tenant/" id1))))))

(deftest can-update-tenant-name
  (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Name" :slug "sluggy"}
                 :model/Tenant _ {:name "Other Name" :slug "sluggy2"}]
    (is (=? {:id id
             :name "New Name"
             :slug "sluggy"
             :is_active true
             :member_count 0
             :attributes nil
             :tenant_collection_id integer?}
            (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:name "New Name"})))
    (is (= "This name is already taken."
           (mt/user-http-request :crowberto :put 400 (str "ee/tenant/" id) {:name "Other Name"})))
    (testing "Can send current name without error"
      (is (=? {:id id
               :name "New Name"
               :slug "sluggy"
               :is_active true
               :member_count 0
               :attributes nil
               :tenant_collection_id integer?}
              (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id) {:name "New Name"}))))))

(deftest can-mark-tenant-as-active-or-inactive
  (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Name" :slug "sluggy"}]
    (is (=? {:id id
             :name "Tenant Name"
             :slug "sluggy"
             :is_active false
             :attributes nil
             :member_count 0
             :tenant_collection_id integer?}
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

(deftest tenant-users-can-only-list-tenant-recipients-visibility-all-test
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
      (mt/with-temporary-setting-values [user-visibility :all
                                         use-tenants true]
        (is (=? #{normal-user-id} (get-recipient-ids normal-user-id)))
        (is (=? #{tenant-user-id} (get-recipient-ids tenant-user-id)))
        (is (=? #{other-tenant-user-id} (get-recipient-ids other-tenant-user-id)))
        ;; note that even superusers only see recipients in the same tenant - maybe revisit this?
        (is (=? #{tenant-user-id
                  other-tenant-user-id
                  normal-user-id} (get-recipient-ids :crowberto)))))))

(deftest tenant-users-can-only-list-tenant-recipients-visibility-group-test
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
      (mt/with-temporary-setting-values [user-visibility :group
                                         use-tenants true]
        (is (=? #{normal-user-id} (get-recipient-ids normal-user-id)))
        (is (=? #{tenant-user-id} (get-recipient-ids tenant-user-id)))
        (is (=? #{other-tenant-user-id} (get-recipient-ids other-tenant-user-id)))
        (is (=? #{tenant-user-id
                  other-tenant-user-id
                  normal-user-id} (get-recipient-ids :crowberto)))))))

(deftest tenant-users-can-only-list-tenant-recipients-visibility-none-test
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
      (mt/with-temporary-setting-values [user-visibility :none
                                         use-tenants true]
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

(deftest can-create-tenant-with-valid-attributes-test
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
                 (:attributes created-tenant))))))))

(deftest can-create-tenant-with-keyword-attributes-test
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
                 (:attributes created-tenant))))))))

(deftest cannot-create-tenant-with-at-prefix-attributes-test
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

(deftest can-update-tenant-attributes-via-put-test
  (testing "Can update tenant attributes via PUT"
    (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Test"
                                           :slug "test-tenant"
                                           :attributes {"initial" "value"}}]
      (let [updated-attrs {"updated" "new-value"
                           "environment" "staging"}
            response (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id)
                                           {:attributes updated-attrs})]
        (is (= updated-attrs (:attributes (t2/select-one :model/Tenant :id id))))
        (is (=? {:id id
                 :name "Tenant Test"
                 :slug "test-tenant"
                 :is_active true
                 :member_count 0
                 :tenant_collection_id integer?}
                (dissoc response :attributes)))))))

(deftest can-update-existing-tenant-attributes-test
  (testing "Can update existing attributes"
    (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Test 2"
                                           :slug "test-tenant-2"
                                           :attributes {"existing" "value"}}]
      (let [new-attrs {"existing" "value2"
                       "new-key" "new-value"}]
        (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id)
                              {:attributes new-attrs})
        (is (= new-attrs (:attributes (t2/select-one :model/Tenant :id id))))))))

(deftest can-clear-tenant-attributes-test
  (testing "Can clear attributes by setting to empty map"
    (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Test 3"
                                           :slug "test-tenant-3"
                                           :attributes {"to-be" "cleared"}}]
      (mt/user-http-request :crowberto :put 200 (str "ee/tenant/" id)
                            {:attributes {}})
      (is (= {} (:attributes (t2/select-one :model/Tenant :id id)))))))

(deftest cannot-update-tenant-with-at-prefix-attributes-test
  (testing "Cannot update with attributes starting with @"
    (mt/with-temp [:model/Tenant {id :id} {:name "Tenant Test 4"
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

(deftest can-get-tenant-collections-from-tree-api
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id :as parent} {:namespace collection/shared-tenant-ns}
                     :model/Collection {other-rooty-id :id} {:namespace collection/shared-tenant-ns}
                     :model/Collection {coll-id :id} {:namespace collection/shared-tenant-ns
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
          (let [res (mt/user-http-request :crowberto :get 200 "collection/tree" :namespace (name collection/shared-tenant-ns))]
            (is (= #{{:id parent-id
                      :children #{{:id coll-id :children #{}}}}
                     {:id other-rooty-id
                      :children #{}}}
                   (simplify-children res))))
          (is (= #{{:id non-tenant-coll-id
                    :children #{}}}
                 (simplify-children
                  (mt/user-http-request :crowberto :get 200 "collection/tree"))
                 (simplify-children
                  (mt/user-http-request :crowberto :get 200 "collection/tree")))))))
    (mt/with-temporary-setting-values [use-tenants false]
      (let [res (mt/user-http-request :crowberto :get 200 "collection/tree" :namespace (name collection/shared-tenant-ns))]
        (is (= [] res))))))

(deftest root-collection-items-does-not-include-tenant-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id} {:namespace collection/shared-tenant-ns}]
        (is (= []
               (->> (mt/user-http-request :rasta :get 200 "collection/root/items")
                    :data
                    (map :id)
                    (filter #(= parent-id %)))))))))

(deftest admins-can-create-shared-tenant-collections-at-root-level
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-model-cleanup [:model/Collection]
        (let [{id :id} (mt/user-http-request :crowberto :post 200 "collection/" {:namespace collection/shared-tenant-ns
                                                                                 :name (mt/random-name)})
              coll (t2/select-one :model/Collection id)]
          (is (some? coll))
          (is (= collection/shared-tenant-ns (:namespace coll))))))))

(deftest tenant-collections-cant-be-created-if-tenants-disabled
  (mt/with-temporary-setting-values [use-tenants false]
    (mt/user-http-request :crowberto :post 400 "collection/" {:namespace collection/shared-tenant-ns :name (mt/random-name)})))

(deftest admins-can-create-shared-tenant-collections-as-children-of-other-collections
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id} {:namespace collection/shared-tenant-ns}]
        (let [id (:id (mt/user-http-request :crowberto :post 200 "collection/" {:name (mt/random-name)
                                                                                :parent_id parent-id}))
              coll (t2/select-one :model/Collection id)]
          (is (some? id))
          (is (= collection/shared-tenant-ns (:namespace coll))))))))

(deftest a-child-of-a-shared-tenant-collection-defaults-to-shared-tenant-collection-type
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Collection {parent-id :id} {:namespace collection/shared-tenant-ns}]
        (is (= "shared-tenant-collection"
               (:namespace (mt/user-http-request :crowberto :post 200 "collection/" {:name (mt/random-name)
                                                                                     :parent_id parent-id}))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Tenant Collection Protection Tests                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest cannot-archive-tenant-root-collection-test
  (testing "Cannot archive a tenant-specific-root-collection via API"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}]
          (testing "attempting to archive tenant root collection returns 400"
            (mt/user-http-request :crowberto :put 400 (str "collection/" tenant-collection-id)
                                  {:archived true}))

          (testing "tenant root collection remains unarchived"
            (is (false? (t2/select-one-fn :archived :model/Collection :id tenant-collection-id)))))))))

(deftest can-archive-tenant-collection-descendants-test
  (testing "*Can* archive descendants of tenant-specific collections via API"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child Collection"
                                                             :namespace :tenant-specific
                                                             :location (collection/children-location tenant-coll)}]
              (testing "archive child collection returns 200"
                (mt/user-http-request :crowberto :put 200 (str "collection/" child-id)
                                      {:archived true}))

              (testing "child collection is archived"
                (is (t2/select-one-fn :archived :model/Collection :id child-id))))))))))

(deftest cannot-delete-tenant-root-collection-test
  (testing "Cannot delete a tenant-specific-root-collection via API"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}]
          (testing "attempting to delete tenant root collection returns 400"
            (mt/user-http-request :crowberto :delete 400 (str "collection/" tenant-collection-id)))

          (testing "tenant root collection still exists"
            (is (t2/exists? :model/Collection :id tenant-collection-id))))))))

(deftest cannot-delete-tenant-collection-descendants-test
  (testing "Cannot delete descendants of tenant collections via API"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child Collection"
                                                             :namespace :tenant-specific
                                                             :location (collection/children-location tenant-coll)
                                                             :archived true}]
              (testing "deleting the collection is allowed"
                (mt/user-http-request :crowberto :delete 200 (str "collection/" child-id)))

              (testing "child collection still exists"
                (is (not (t2/exists? :model/Collection :id child-id)))))))))))

(deftest cannot-move-tenant-root-collection-test
  (testing "Cannot move tenant-specific-root-collection to a different parent"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/Collection {target-id :id} {:name "Target Collection"
                                                          :location "/"
                                                          :namespace :tenant-specific}]
          (testing "attempting to move tenant root collection returns 400"
            (mt/user-http-request :crowberto :put 400 (str "collection/" tenant-collection-id)
                                  {:parent_id target-id}))

          (testing "tenant root collection location remains at root"
            (is (= "/" (t2/select-one-fn :location :model/Collection :id tenant-collection-id)))))))))

(deftest can-move-tenant-descendants-within-tenant-namespace-test
  (testing "Can move tenant collection descendants within the same tenant namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-a-id :id} {:name "Child A"
                                                               :namespace :tenant-specific
                                                               :location (collection/children-location tenant-coll)}
                           :model/Collection {child-b-id :id} {:name "Child B"
                                                               :namespace :tenant-specific
                                                               :location (collection/children-location tenant-coll)}]
              (testing "can move child B under child A"
                (mt/user-http-request :crowberto :put 200 (str "collection/" child-b-id)
                                      {:parent_id child-a-id})

                (is (= (str "/" tenant-collection-id "/" child-a-id "/")
                       (t2/select-one-fn :location :model/Collection :id child-b-id)))))))))))

(deftest cannot-move-regular-collection-into-tenant-namespace-test
  (testing "Can move regular collection into tenant namespace via API"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/Collection {regular-id :id} {:name "Regular Collection" :location "/"}]
          (testing "moving regular collection into tenant namespace succeeds"
            (mt/user-http-request :crowberto :put 400 (str "collection/" regular-id)
                                  {:parent_id tenant-collection-id})))))))

(deftest cannot-move-tenant-collection-out-of-tenant-namespace-test
  (testing "Can move tenant collection out of tenant namespace via API"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/Collection {target-id :id} {:name "Target Collection" :location "/"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child Collection"
                                                             :namespace :tenant-specific
                                                             :location (collection/children-location tenant-coll)}]
              (testing "moving tenant child out to regular namespace succeeds"
                (mt/user-http-request :crowberto :put 400 (str "collection/" child-id)
                                      {:parent_id target-id})))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Tenant Collection Visibility Tests                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest non-tenant-users-dont-see-tenant-collections-test
  (testing "Non-tenant users cannot see tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {regular-user-id :id} {}]
          (mt/user-http-request regular-user-id :get 403 (str "collection/" tenant-collection-id)))))))

(deftest tenant-users-can-read-items-in-tenant-collection-test
  (testing "Tenant users can read items in their tenant collection"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}]
          (mt/with-temp [:model/Card {card-id :id} {:name "Tenant Card"
                                                    :collection_id tenant-collection-id
                                                    :database_id db-id
                                                    :dataset_query {:database db-id
                                                                    :type :query
                                                                    :query {:source-table table-id}}}]
            (testing "tenant user can fetch collection items"
              (let [items (mt/user-http-request tenant-user-id :get 200 (str "collection/" tenant-collection-id "/items"))
                    card-ids (set (map :id (:data items)))]
                (is (contains? card-ids card-id))))))))))

(deftest non-tenant-users-cannot-access-tenant-collection-items-test
  (testing "Non-tenant users get 403 when accessing tenant collection items"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {regular-user-id :id} {}]
          (testing "regular user gets 403 for tenant collection items"
            (mt/user-http-request regular-user-id :get 403 (str "collection/" tenant-collection-id "/items"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                  CRUD Operations in Tenant Collections                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest can-create-cards-in-tenant-collections-test
  (testing "Can create cards in tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}]
          (mt/with-perm-for-group-and-table! (perms/all-external-users-group) (mt/id :venues) :perms/view-data :unrestricted
            (mt/with-perm-for-group-and-table! (perms/all-external-users-group) (mt/id :venues) :perms/create-queries :query-builder
              (let [card-data {:name "New Card"
                               :collection_id tenant-collection-id
                               :visualization_settings {}
                               :display "table"
                               :database_id (mt/id)
                               :dataset_query (mt/mbql-query venues)}
                    response (mt/user-http-request tenant-user-id :post 200 "card" card-data)]
                ;; TODO look into why this is failing
                (testing "card is created in tenant collection"
                  (is (some? (:id response)))
                  (is (= tenant-collection-id (:collection_id response))))))))))))

(deftest can-create-dashboards-in-tenant-collections-test
  (testing "Can create dashboards in tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}]
          (let [dashboard-data {:name "New Dashboard"
                                :collection_id tenant-collection-id}
                response (mt/user-http-request tenant-user-id :post 200 "dashboard" dashboard-data)]
            (testing "dashboard is created in tenant collection"
              (is (some? (:id response)))
              (is (= tenant-collection-id (:collection_id response))))))))))

(deftest can-update-items-in-tenant-collections-test
  (testing "Can update items in tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}]
          (mt/with-temp [:model/Card {card-id :id} {:name "Original Name"
                                                    :collection_id tenant-collection-id
                                                    :database_id db-id
                                                    :dataset_query {:database db-id
                                                                    :type :query
                                                                    :query {:source-table table-id}}}]
            (let [response (mt/user-http-request tenant-user-id :put 200 (str "card/" card-id)
                                                 {:name "Updated Name"})]
              (testing "card name is updated"
                (is (= "Updated Name" (:name response)))))))))))

(deftest can-archive-items-in-tenant-collections-test
  (testing "Can archive items in tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Tenant Test" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/Database {db-id :id} {}
                       :model/Table {table-id :id} {:db_id db-id}]
          (mt/with-temp [:model/Card {card-id :id} {:name "Card to Archive"
                                                    :collection_id tenant-collection-id
                                                    :database_id db-id
                                                    :dataset_query {:database db-id
                                                                    :type :query
                                                                    :query {:source-table table-id}}}]
            (mt/user-http-request tenant-user-id :put 200 (str "card/" card-id)
                                  {:archived true})
            (testing "card is archived"
              (is (true? (t2/select-one-fn :archived :model/Card :id card-id))))))))))

(deftest shared-tenant-collections-appear-in-trash-test
  (testing "GET /api/collection/:id/items for trash collection"
    (testing "archived collections with shared-tenant-collection and tenant-specific namespaces appear in trash"
      (mt/with-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Collection {normal-id :id}     {:name "Normal Collection"}
                         :model/Collection {shared-id :id}     {:name      "Shared Tenant Collection"
                                                                :namespace "shared-tenant-collection"}
                         :model/Collection {tenant-id :id}     {:name      "Tenant Specific Collection"
                                                                :namespace "tenant-specific"}]
            ;; Archive all three collections
            (doseq [id [normal-id shared-id tenant-id]]
              (mt/user-http-request :crowberto :put 200 (str "collection/" id) {:archived true}))
            (let [trash-items (->> (mt/user-http-request :crowberto :get 200 (str "collection/" (collection/trash-collection-id) "/items"))
                                   :data
                                   (map :name)
                                   (into #{}))]
              (is (= #{"Normal Collection" "Shared Tenant Collection" "Tenant Specific Collection"}
                     trash-items)))))))))
