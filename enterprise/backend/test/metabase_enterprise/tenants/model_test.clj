(ns metabase-enterprise.tenants.model-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.tenants.model :as tenants.model]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Tenant Collection Creation                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-auto-creates-collection-test
  (testing "Creating a Tenant automatically creates a dedicated collection"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
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
            (mt/with-temp [:model/Collection child {:name "Child Collection"
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
                       :model/Collection regular-coll {:name "Regular Collection" :location "/"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "returns true for tenant root collection"
              (is (collection/is-dedicated-tenant-collection-or-descendant? tenant-coll)))
            (testing "returns false for regular collection"
              (is (not (collection/is-dedicated-tenant-collection-or-descendant? regular-coll))))
            (mt/with-temp [:model/Collection child {:name "Child"
                                                    :namespace "tenant-specific"
                                                    :location (collection/children-location tenant-coll)}]
              (testing "returns true for tenant collection descendant"
                (is (collection/is-dedicated-tenant-collection-or-descendant? child))))))))))

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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Tenant Collection Name Localization                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest maybe-localize-tenant-collection-names-turns-all-dtcs-into-our-data
  (testing "maybe-localize-tenant-collection-names handles multiple collections efficiently"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant1-coll-id :tenant_collection_id tenant1-id :id} {:name "Tenant One" :slug "tenant1"}
                       :model/Tenant {tenant2-coll-id :tenant_collection_id} {:name "Tenant Two" :slug "tenant2"}
                       :model/Collection regular-coll {:name "Regular Collection" :location "/"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant1-id}]
          (let [colls [(t2/select-one :model/Collection :id tenant1-coll-id)
                       (t2/select-one :model/Collection :id tenant2-coll-id)
                       regular-coll]
                localized-colls (collection/maybe-localize-tenant-collection-names colls)]
            (is (= ["Tenant collection: Tenant One"
                    "Tenant collection: Tenant Two"
                    "Regular Collection"]
                   (map :name localized-colls))))
          (mt/with-current-user tenant-user-id
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"You don't have permissions to do that"
                                  (collection/maybe-localize-tenant-collection-names
                                   [(t2/select-one :model/Collection tenant2-coll-id)])))
            (is (= ["Our data"
                    "Regular Collection"]
                   (map :name (collection/maybe-localize-tenant-collection-names [(t2/select-one :model/Collection tenant1-coll-id)
                                                                                  regular-coll]))))))))))

(deftest maybe-localize-tenant-collection-name-single-test
  (testing "maybe-localize-tenant-collection-name works for single collection"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id
                                      tenant-id :id} {:name "My Tenant" :slug "mytenant"}
                       :model/User {tenant-user :id} {:tenant_id tenant-id}]
          (let [coll (t2/select-one :model/Collection :id tenant-collection-id)
                localized-coll (collection/maybe-localize-tenant-collection-name coll)]
            (is (= "Tenant collection: My Tenant" (:name localized-coll))))

          (mt/with-current-user tenant-user
            (let [coll (t2/select-one :model/Collection :id tenant-collection-id)
                  localized-coll (collection/maybe-localize-tenant-collection-name coll)]
              (is (= "Our data" (:name localized-coll))))))))))
