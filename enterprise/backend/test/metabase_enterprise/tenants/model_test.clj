(ns metabase-enterprise.tenants.model-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.tenants.model :as tenants.model]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Tenant Collection Creation                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-auto-creates-collection-test
  (testing "Creating a Tenant automatically creates a dedicated collection"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (testing "tenant_collection_id is set and references a valid collection"
            (is (some? tenant-collection-id))
            (is (t2/exists? :model/Collection :id tenant-collection-id)))

          (let [coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "collection has correct namespace"
              (is (= :tenant-specific (:namespace coll))))

            (testing "collection has correct type"
              (is (= "tenant-specific-root-collection" (:type coll))))

            (testing "collection has correct name"
              (is (= "Tenant Collection: TestyLilTenant" (:name coll))))

            (testing "collection location is at root"
              (is (= "/" (:location coll))))))))))

(deftest tenant-collection-name-follows-tenant-name-test
  (testing "Tenant collection name includes the tenant name"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "My Company Inc" :slug "mycompany"}]
          (let [coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (is (= "Tenant Collection: My Company Inc" (:name coll)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Collection Namespace Constraints                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-collection-children-inherit-namespace-test
  (testing "Children of tenant collections must have tenant-specific namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id :as child} {:name "Child Collection"
                                                                       :namespace :tenant-specific
                                                                       :location (collection/children-location tenant-coll)}]
              (testing "child has tenant-specific namespace"
                (is (= :tenant-specific (:namespace child))))

              (testing "child does NOT have tenant-specific-root-collection type"
                (is (not= "tenant-specific-root-collection" (:type child)))))))))))

(deftest tenant-collection-descendants-must-be-tenant-specific-test
  (testing "All descendants in tenant hierarchy must have tenant-specific namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child"
                                                             :namespace :tenant-specific
                                                             :location (collection/children-location tenant-coll)}
                           :model/Collection grandchild     {:name "Grandchild"
                                                             :namespace :tenant-specific
                                                             :location (str "/" tenant-collection-id "/" child-id "/")}]
              (testing "grandchild has tenant-specific namespace"
                (is (= :tenant-specific (:namespace grandchild))))

              (testing "grandchild does NOT have root collection type"
                (is (not= "tenant-specific-root-collection" (:type grandchild)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Function Tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest is-dedicated-tenant-collection-or-descendant-test
  (testing "is-dedicated-tenant-collection-or-descendant? correctly identifies tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}
                       :model/Collection {regular-coll-id :id :as regular-coll} {:name "Regular Collection" :location "/"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "returns true for tenant root collection"
              (is (collection/is-dedicated-tenant-collection-or-descendant? tenant-coll)))

            (testing "returns false for regular collection"
              (is (not (collection/is-dedicated-tenant-collection-or-descendant? regular-coll))))

            (mt/with-temp [:model/Collection {child-id :id :as child} {:name "Child"
                                                                       :namespace "tenant-specific"
                                                                       :location (collection/children-location tenant-coll)}]
              (testing "returns true for tenant collection descendant"
                (is (collection/is-dedicated-tenant-collection-or-descendant? child))))))))))

(deftest is-dedicated-tenant-root-collection-test
  (testing "is-dedicated-tenant-root-collection? correctly identifies root tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "returns true for tenant root collection"
              (is (collection/is-dedicated-tenant-root-collection? tenant-coll)))

            (mt/with-temp [:model/Collection {child-id :id :as child} {:name "Child"
                                                                       :namespace "tenant-specific"
                                                                       :location (collection/children-location tenant-coll)}]
              (testing "returns false for tenant collection descendant"
                (is (not (collection/is-dedicated-tenant-root-collection? child)))))

            (mt/with-temp [:model/Collection {regular-id :id :as regular} {:name "Regular" :location "/"}]
              (testing "returns false for regular collection"
                (is (not (collection/is-dedicated-tenant-root-collection? regular)))))))))))

(deftest user-tenant-collection-and-descendant-ids-test
  (testing "user->tenant-collection-and-descendant-ids returns correct collection IDs"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/User {regular-user-id :id} {}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child"
                                                             :namespace "tenant-specific"
                                                             :location (collection/children-location tenant-coll)}
                           :model/Collection {grandchild-id :id} {:name "Grandchild"
                                                                  :namespace "tenant-specific"
                                                                  :location (str "/" tenant-collection-id "/" child-id "/")}]

              (testing "tenant user gets root collection and all descendants"
                (let [ids (set (tenants.model/user->tenant-collection-and-descendant-ids tenant-user-id))]
                  (is (contains? ids tenant-collection-id))
                  (is (contains? ids child-id))
                  (is (contains? ids grandchild-id))
                  (is (= 3 (count ids)))))

              (testing "regular user gets empty vector"
                (is (= [] (tenants.model/user->tenant-collection-and-descendant-ids regular-user-id)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Tenant Collection Constraints                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest cannot-set-personal-owner-on-tenant-collection-test
  (testing "Tenant collections should not have personal_owner_id set"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}
                       :model/User {user-id :id} {}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "tenant root collection has no personal_owner_id"
              (is (nil? (:personal_owner_id tenant-coll))))

            (testing "attempting to set personal_owner_id should fail"
              (is (thrown-with-msg?
                   Exception
                   #"Personal Collections must be in the default namespace"
                   (t2/update! :model/Collection tenant-collection-id
                               {:personal_owner_id user-id}))))))))))

(deftest cannot-change-namespace-after-creation-test
  (testing "Cannot change namespace of tenant collection after creation"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (testing "attempting to change namespace to nil should fail"
            (is (thrown-with-msg?
                 Exception
                 #"cannot move a Collection to a different namespace"
                 (t2/update! :model/Collection tenant-collection-id
                             {:namespace nil})))))))))
