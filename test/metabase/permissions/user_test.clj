(ns metabase.permissions.user-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.user :as permissions.user]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :test-users))

(defn- collection-permissions
  "The Collection permission of the test user `user` on each of `ids` in the Collection namespace `root-namespace`."
  [user ids root-namespace]
  (perms/collection-permissions-for-user (data-perms/user-info (mt/user->id user)) (vec ids) {:root-namespace root-namespace}))

(deftest personal-collection-permissions-test
  (testing "Does the user write their Personal Collection?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [personal-collection (collection/user->personal-collection (mt/user->id :lucky))]
        (is (= {(u/the-id personal-collection) :read-and-write}
               (collection-permissions :lucky [(u/the-id personal-collection)] nil)))
        (testing "...and any descendant Collections of their Personal Collection?"
          (mt/with-temp [:model/Collection child-collection      {:name     "child"
                                                                  :location (collection/children-location personal-collection)}
                         :model/Collection grandchild-collection {:name     "grandchild"
                                                                  :location (collection/children-location child-collection)}]
            (is (= {(u/the-id child-collection)      :read-and-write
                    (u/the-id grandchild-collection) :read-and-write}
                   (collection-permissions :lucky [(u/the-id child-collection) (u/the-id grandchild-collection)] nil)))))))))

(deftest transform-users-can-create-transform-collections-test
  (testing "Users with transforms read permission can create transform collections, even in the root"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Test transform coll" :namespace collection/transforms-ns}]
      (testing "without permission"
        (mt/with-dynamic-fn-redefs [data-perms/is-data-analyst? (constantly false)]
          (is (= {nil :none} (collection-permissions :lucky [nil] collection/transforms-ns)))
          (is (= {coll-id :none} (collection-permissions :lucky [coll-id] collection/transforms-ns)))))
      (testing "with permission"
        (mt/with-dynamic-fn-redefs [data-perms/is-data-analyst? (constantly true)]
          (is (= {nil :read-and-write} (collection-permissions :lucky [nil] collection/transforms-ns)))
          (is (= {coll-id :read-and-write} (collection-permissions :lucky [coll-id] collection/transforms-ns))))))))

(deftest query-creation-capabilities-test
  (testing "query-creation-capabilities returns correct permissions based on user's create-queries perms"
    (let [all-users-group-id (:id (perms-group/all-users))]
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "user with no permissions"
          (mt/with-no-data-perms-for-all-users!
            (mt/with-current-user (mt/user->id :rasta)
              (is (= {:can-create-queries        false
                      :can-create-native-queries false}
                     (permissions.user/query-creation-capabilities (mt/user->id :rasta)))))))
        (testing "user with query-builder permissions"
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-database-permission! all-users-group-id db-id :perms/create-queries :query-builder)
            (mt/with-current-user (mt/user->id :rasta)
              (is (= {:can-create-queries        true
                      :can-create-native-queries false}
                     (permissions.user/query-creation-capabilities (mt/user->id :rasta)))))))
        (testing "user with query-builder-and-native permissions"
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-database-permission! all-users-group-id db-id :perms/create-queries :query-builder-and-native)
            (mt/with-current-user (mt/user->id :rasta)
              (is (= {:can-create-queries        true
                      :can-create-native-queries true}
                     (permissions.user/query-creation-capabilities (mt/user->id :rasta)))))))))))
