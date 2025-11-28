(ns metabase-enterprise.tenants.permissions-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest tenant-users-are-added-to-correct-groups
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "name" :slug "name"}
                 :model/User {user-id :id} {:tenant_id tenant-id}]
    (testing "Should NOT be added to the 'All Users' group"
      (is (not (t2/exists? :model/PermissionsGroupMembership
                           :user_id user-id
                           :group_id (u/the-id (perms/all-users-group))))))
    (testing "Should be added to the 'All External Users' group"
      (is (t2/exists? :model/PermissionsGroupMembership
                      :user_id user-id
                      :group_id (u/the-id (perms/all-external-users-group)))))))

(deftest tenant-groups-get-no-perms-on-new-dbs
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:is_tenant_group true}
                 :model/Database {db-id :id} {}]
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/view-data :perm_value :blocked))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/create-queries :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/download-results :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-table-metadata :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-database :perm_value :no))))

(deftest new-tenant-groups-get-no-perms-on-existing-dbs
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/PermissionsGroup {group-id :id} {:is_tenant_group true}]
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/view-data :perm_value :blocked))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/create-queries :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/download-results :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-table-metadata :perm_value :no))
    (is (t2/exists? :model/DataPermissions :db_id db-id :group_id group-id :perm_type :perms/manage-database :perm_value :no))))

(deftest tenant-users-and-groups
  (mt/with-temp [:model/Tenant {tenant-id :id} {:name "name" :slug "slug"}
                 :model/User {tenant-user :id} {:tenant_id tenant-id}
                 :model/User {normal-user :id} {}
                 :model/PermissionsGroup {tenant-group :id} {:is_tenant_group true}
                 :model/PermissionsGroup {normal-group :id} {:is_tenant_group false}]
    (testing "A tenant user"
      (testing "cannot be added to a normal group"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Cannot add non-tenant user to tenant-group or vice versa"
                              (perms/add-user-to-group! tenant-user normal-group))))
      (testing "can be added to tenant groups"
        (perms/add-user-to-group! tenant-user tenant-group)))
    (testing "A normal user"
      (testing "cannot be added to a tenant group"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Cannot add non-tenant user to tenant-group or vice versa"
                              (perms/add-user-to-group! normal-user tenant-group))))
      (testing "can be added to a normal group"
        (perms/add-user-to-group! normal-user normal-group)))))

(deftest tenant-users-cannot-be-group-managers-test
  (testing "External/tenant users cannot be made group managers"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Test Tenant" :slug "test"}
                       :model/User {external-user-id :id} {:tenant_id tenant-id}
                       :model/PermissionsGroup {tenant-group-id :id} {:name "Tenant Group"
                                                                      :is_tenant_group true}
                       :model/PermissionsGroup {normal-group-id :id} {:name "Normal Group"
                                                                      :is_tenant_group false}]

          (testing "cannot make external user group manager of tenant group"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"External users cannot be made group managers"
                 (perms/add-users-to-groups! [{:user external-user-id
                                               :group tenant-group-id
                                               :is-group-manager? true}]))))

          (testing "cannot make external user group manager of normal group"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"External users cannot be made group managers"
                 (perms/add-users-to-groups! [{:user external-user-id
                                               :group normal-group-id
                                               :is-group-manager? true}]))))

          (testing "external user can be regular member of tenant group"
            (is (nil? (perms/add-users-to-groups! [{:user external-user-id
                                                    :group tenant-group-id
                                                    :is-group-manager? false}]))))

          (testing "external user cannot be member of normal group at all"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Cannot add non-tenant user to tenant-group or vice versa"
                 (perms/add-users-to-groups! [{:user external-user-id
                                               :group normal-group-id
                                               :is-group-manager? false}])))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                        Moving Collections Into/Out of Tenant-Specific Namespace                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- group->collection-perms
  "Return the collection permission paths for a `perms-group`, for the given collections."
  [collections perms-group]
  (let [collection-ids (set (map u/the-id collections))]
    (t2/select-fn-set :object :model/Permissions
                      {:where [:and
                               [:like :object "/collection/%"]
                               [:= :group_id (u/the-id perms-group)]]})))

(deftest move-collection-into-tenant-specific-namespace-test
  (testing "Moving a Collection INTO the tenant-specific namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Test Tenant" :slug "test"}
                       :model/PermissionsGroup {group-id :id} {:name "Test Group"}
                       :model/Collection {root-coll-id :id} {:name "Root Collection" :location "/"}]

          (testing "from Root Collection - should DELETE all permissions entries"
            (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Collection A"
                                                                     :location (str "/" root-coll-id "/")}]
              ;; Grant permissions on the collection
              (perms/grant-collection-readwrite-permissions! group-id coll)
              ;; Verify permissions exist
              (is (= #{(perms/collection-readwrite-path coll)}
                     (group->collection-perms [coll] group-id)))

              ;; Move collection into tenant-specific namespace
              (t2/update! :model/Collection coll-id
                          {:location (collection/children-location
                                      (t2/select-one :model/Collection :id tenant-collection-id))})

              ;; Verify permissions were deleted
              (is (= #{}
                     (group->collection-perms [coll] group-id)))))

          (testing "with descendants - should DELETE permissions for collection and all descendants"
            (mt/with-temp [:model/Collection {parent-id :id :as parent} {:name "Parent"
                                                                         :location (str "/" root-coll-id "/")}
                           :model/Collection {child-id :id :as child} {:name "Child"
                                                                       :location (str "/" root-coll-id "/" parent-id "/")}
                           :model/Collection {grandchild-id :id :as grandchild} {:name "Grandchild"
                                                                                 :location (str "/" root-coll-id "/" parent-id "/" child-id "/")}]
              ;; Grant permissions on all collections
              (perms/grant-collection-read-permissions! group-id parent)
              (perms/grant-collection-read-permissions! group-id child)
              (perms/grant-collection-readwrite-permissions! group-id grandchild)

              ;; Verify permissions exist for all
              (is (= 3 (count (group->collection-perms [parent child grandchild] group-id))))

              ;; Move parent into tenant-specific namespace
              (t2/update! :model/Collection parent-id
                          {:location (collection/children-location
                                      (t2/select-one :model/Collection :id tenant-collection-id))})

              ;; Verify all permissions were deleted recursively
              (is (= #{}
                     (group->collection-perms [parent child grandchild] group-id))))))))))

(deftest move-collection-out-of-tenant-specific-namespace-test
  (testing "Moving a Collection OUT OF the tenant-specific namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Test Tenant" :slug "test"}
                       :model/PermissionsGroup {group-id :id} {:name "Test Group"}
                       :model/Collection {target-coll-id :id :as target-coll} {:name "Target Collection" :location "/"}]

          (testing "to Root Collection - should GRANT permissions matching new parent"
            (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Collection A"
                                                                     :namespace "tenant-specific"
                                                                     :location (collection/children-location
                                                                                (t2/select-one :model/Collection :id tenant-collection-id))}]
              ;; Grant permissions on Root Collection
              (perms/grant-collection-readwrite-permissions! group-id collection/root-collection)

              ;; Verify tenant collection has no permissions
              (is (= #{}
                     (group->collection-perms [coll] group-id)))

              ;; Move collection out of tenant-specific namespace to Root
              (t2/update! :model/Collection coll-id
                          {:location "/"})

              ;; Verify permissions were granted matching Root Collection
              (is (= #{(perms/collection-readwrite-path coll)}
                     (group->collection-perms [coll] group-id)))))

          (testing "to a regular Collection - should GRANT permissions matching new parent"
            (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Collection B"
                                                                     :namespace "tenant-specific"
                                                                     :location (collection/children-location
                                                                                (t2/select-one :model/Collection :id tenant-collection-id))}]
              ;; Grant read permissions on target collection
              (perms/grant-collection-read-permissions! group-id target-coll)

              ;; Verify tenant collection has no permissions
              (is (= #{}
                     (group->collection-perms [coll] group-id)))

              ;; Move collection out of tenant-specific namespace to target collection
              (t2/update! :model/Collection coll-id
                          {:location (collection/children-location target-coll)})

              ;; Verify permissions were granted matching parent (read-only)
              (is (= #{(perms/collection-read-path coll)}
                     (group->collection-perms [coll] group-id)))))

          (testing "with descendants - should GRANT permissions for collection and all descendants"
            (mt/with-temp [:model/Collection {parent-id :id :as parent} {:name "Parent"
                                                                         :namespace "tenant-specific"
                                                                         :location (collection/children-location
                                                                                    (t2/select-one :model/Collection :id tenant-collection-id))}
                           :model/Collection {child-id :id :as child} {:name "Child"
                                                                       :namespace "tenant-specific"
                                                                       :location (str "/" tenant-collection-id "/" parent-id "/")}
                           :model/Collection {grandchild-id :id :as grandchild} {:name "Grandchild"
                                                                                 :namespace "tenant-specific"
                                                                                 :location (str "/" tenant-collection-id "/" parent-id "/" child-id "/")}]
              ;; Grant write permissions on target collection
              (perms/grant-collection-readwrite-permissions! group-id target-coll)

              ;; Verify tenant collections have no permissions
              (is (= #{}
                     (group->collection-perms [parent child grandchild] group-id)))

              ;; Move parent out of tenant-specific namespace
              (t2/update! :model/Collection parent-id
                          {:location (collection/children-location target-coll)})

              ;; Verify permissions were granted recursively for all descendants
              (is (= #{(perms/collection-readwrite-path parent)
                       (perms/collection-readwrite-path child)
                       (perms/collection-readwrite-path grandchild)}
                     (group->collection-perms [parent child grandchild] group-id))))))))))

(deftest move-collection-across-tenant-boundary-no-change-test
  (testing "Moving a Collection within the same namespace should not affect permissions"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "Test Tenant" :slug "test"}
                       :model/PermissionsGroup {group-id :id} {:name "Test Group"}
                       :model/Collection {regular-a :id} {:name "Regular A" :location "/"}
                       :model/Collection {regular-b :id} {:name "Regular B" :location "/"}]

          (testing "within regular namespace - permissions should remain unchanged"
            (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "Collection"
                                                                     :location (str "/" regular-a "/")}]
              ;; Grant permissions
              (perms/grant-collection-read-permissions! group-id coll)
              (let [perms-before (group->collection-perms [coll] group-id)]
                ;; Move within regular namespace
                (t2/update! :model/Collection coll-id {:location (str "/" regular-b "/")})
                ;; Permissions should be unchanged
                (is (= perms-before (group->collection-perms [coll] group-id))))))

          (testing "within tenant-specific namespace - permissions should remain empty"
            (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
              (mt/with-temp [:model/Collection {coll-a-id :id} {:name "Tenant Subcoll A"
                                                                :namespace "tenant-specific"
                                                                :location (collection/children-location tenant-coll)}
                             :model/Collection {coll-b-id :id :as coll-b} {:name "Collection"
                                                                           :namespace "tenant-specific"
                                                                           :location (str "/" tenant-collection-id "/" coll-a-id "/")}]
                ;; Verify no permissions exist
                (is (= #{} (group->collection-perms [coll-b] group-id)))
                ;; Move within tenant-specific namespace
                (t2/update! :model/Collection coll-b-id {:location (collection/children-location tenant-coll)})
                ;; Permissions should still be empty
                (is (= #{} (group->collection-perms [coll-b] group-id)))))))))))
