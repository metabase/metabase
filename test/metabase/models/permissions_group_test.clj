(ns metabase.models.permissions-group-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.permissions-group
    :as perms-group
    :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest admin-root-entry-test
  (testing "Check that the root entry for Admin was created"
    (is (t2/exists? Permissions :group_id (u/the-id (perms-group/admin)), :object "/"))))

(deftest magic-groups-test
  (testing "check that we can get the magic permissions groups through the helper functions\n"
    (doseq [[group-name group] {"All Users"      (perms-group/all-users)
                                "Administrators" (perms-group/admin)}]
      (testing group-name
        (is (mi/instance-of? PermissionsGroup group))
        (is (= group-name
               (:name group)))
        (testing "make sure we're not allowed to delete the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (t2/delete! PermissionsGroup :id (u/the-id group)))))
        (testing "make sure we're not allowed to edit the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (t2/update! PermissionsGroup (u/the-id group) {:name "Cool People"}))))))))

(deftest new-users-test
  (testing "newly created users should get added to the appropriate magic groups"
    (testing "regular user"
      (t2.with-temp/with-temp [User {user-id :id}]
        (testing "Should be added to All Users group"
          (is (t2/exists? PermissionsGroupMembership
                          :user_id  user-id
                          :group_id (u/the-id (perms-group/all-users)))))
        (testing "Should not be added to Admin group"
          (is (not (t2/exists? PermissionsGroupMembership
                               :user_id  user-id
                               :group_id (u/the-id (perms-group/admin))))))))

    (testing "superuser"
      (t2.with-temp/with-temp [User {user-id :id} {:is_superuser true}]
        (testing "Should be added to All Users group"
          (is (t2/exists? PermissionsGroupMembership
                          :user_id  user-id
                          :group_id (u/the-id (perms-group/all-users)))))
        (testing "Should be added to Admin group"
          (is (t2/exists? PermissionsGroupMembership
                          :user_id  user-id
                          :group_id (u/the-id (perms-group/admin)))))))))

(s/defn ^:private group-has-full-access?
  "Does a group have permissions for `object` and *all* of its children?"
  [group-id :- su/IntGreaterThanOrEqualToZero object :- perms/PathSchema]
  ;; e.g. WHERE (object || '%') LIKE '/db/1000/'
  (t2/exists? Permissions
    :group_id group-id
    object    [:like (h2x/concat :object (h2x/literal "%"))]))

(deftest newly-created-databases-test
  (testing "magic groups should have permissions for newly created databases\n"
    (t2.with-temp/with-temp [Database {database-id :id}]
      (doseq [group [(perms-group/all-users)
                     (perms-group/admin)]]
        (testing (format "Group = %s" (pr-str (:name group)))
          (group-has-full-access? (u/the-id group) (perms/data-perms-path database-id)))))))

(deftest add-remove-from-admin-group-test
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "adding user to Admin should set is_superuser -> true")
    (t2.with-temp/with-temp [User {user-id :id}]
      (t2/insert! PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))
      (is (= true
             (t2/select-one-fn :is_superuser User, :id user-id))))

    (testing "removing user from Admin should set is_superuser -> false"
      (t2.with-temp/with-temp [User {user-id :id} {:is_superuser true}]
        (t2/delete! PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))
        (is (= false
               (t2/select-one-fn :is_superuser User, :id user-id)))))

    (testing "setting is_superuser -> true should add user to Admin"
      (t2.with-temp/with-temp [User {user-id :id}]
        (t2/update! User user-id {:is_superuser true})
        (is (= true
               (t2/exists? PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))

    (testing "setting is_superuser -> false should remove user from Admin"
      (t2.with-temp/with-temp [User {user-id :id} {:is_superuser true}]
        (t2/update! User user-id {:is_superuser false})
        (is (= false
               (t2/exists? PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))))
