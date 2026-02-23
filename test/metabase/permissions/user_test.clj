(ns metabase.permissions.user-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection-test :as collection-test]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-test :as perms-test]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.user :as permissions.user]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest ^:parallel check-test-users-have-valid-permissions-sets-test
  (testing "Make sure the test users have valid permissions sets"
    (doseq [user [:rasta :crowberto :lucky :trashbird]]
      (testing user
        (is (perms-test/is-permissions-set? (permissions.user/user-permissions-set (mt/user->id user))))))))

(deftest ^:parallel group-with-no-permissions-test
  (testing (str "Adding a group with *no* permissions shouldn't suddenly break all the permissions sets (This was a "
                "bug @tom found where a group with no permissions would cause the permissions set to contain `nil`).")
    (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                   :model/PermissionsGroupMembership _              {:group_id group-id, :user_id (mt/user->id :rasta)}]
      (is (perms-test/is-permissions-set? (permissions.user/user-permissions-set (mt/user->id :rasta)))))))

(defn- remove-non-collection-perms [perms-set]
  (set (for [perms-path perms-set
             :when      (str/starts-with? perms-path "/collection/")]
         perms-path)))

(deftest personal-collection-permissions-test
  (testing "Does permissions-set include permissions for my Personal Collection?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (is (contains?
           (permissions.user/user-permissions-set (mt/user->id :lucky))
           (permissions.path/collection-readwrite-path (collection/user->personal-collection (mt/user->id :lucky)))))

      (testing "...and for any descendant Collections of my Personal Collection?"
        (mt/with-temp [:model/Collection child-collection      {:name     "child"
                                                                :location (collection/children-location
                                                                           (collection/user->personal-collection (mt/user->id :lucky)))}
                       :model/Collection grandchild-collection {:name     "grandchild"
                                                                :location (collection/children-location child-collection)}]
          (is (set/subset?
               #{(permissions.path/collection-readwrite-path (collection/user->personal-collection (mt/user->id :lucky)))
                 "/collection/child/"
                 "/collection/grandchild/"}
               (->> (permissions.user/user-permissions-set (mt/user->id :lucky))
                    remove-non-collection-perms
                    (collection-test/perms-path-ids->names [child-collection grandchild-collection])))))))))

(deftest transform-users-can-create-transform-collections-test
  (testing "Users with transforms read permission can create transform collections, even in the root"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test transform coll" :namespace collection/transforms-ns}]
      (testing "without permission"
        (with-redefs [data-perms/is-data-analyst? (constantly false)]
          (is (not (contains? (permissions.user/user-permissions-set (mt/user->id :lucky)) "/collection/namespace/transforms/root/")))
          (is (not (contains? (permissions.user/user-permissions-set (mt/user->id :lucky)) (format "/collection/%s" coll-id))))))
      (testing "with permission"
        (with-redefs [data-perms/is-data-analyst? (constantly true)]
          (is (contains? (permissions.user/user-permissions-set (mt/user->id :lucky)) "/collection/namespace/transforms/root/"))
          (is (contains? (permissions.user/user-permissions-set (mt/user->id :lucky)) (permissions.path/collection-readwrite-path coll-id))))))))
