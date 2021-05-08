(ns metabase.models.permissions-group-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.permissions :as perms :refer [Permissions]]
            [metabase.models.permissions-group :as perm-group :refer [PermissionsGroup]]
            [metabase.models.permissions-group-membership :refer [PermissionsGroupMembership]]
            [metabase.models.user :refer [User]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import metabase.models.permissions_group.PermissionsGroupInstance))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest admin-root-entry-test
  (testing "Check that the root entry for Admin was created"
    (is (db/exists? Permissions :group_id (u/the-id (perm-group/admin)), :object "/"))))

(deftest magic-groups-test
  (testing "check that we can get the magic permissions groups through the helper functions\n"
    (doseq [[group-name group] {"All Users"      (perm-group/all-users)
                                "Administrators" (perm-group/admin)
                                "MetaBot"        (perm-group/metabot)}]
      (testing group-name
        (is (instance? PermissionsGroupInstance group))
        (is (= group-name
               (:name group)))
        (testing "make sure we're not allowed to delete the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (db/delete! PermissionsGroup :id (u/the-id group)))))
        (testing "make sure we're not allowed to edit the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (db/update! PermissionsGroup (u/the-id group) :name "Cool People"))))))))

(deftest new-users-test
  (testing "newly created users should get added to the appropriate magic groups"
    (testing "regular user"
      (mt/with-temp User [{user-id :id}]
        (testing "Should be added to All Users group"
          (is (db/exists? PermissionsGroupMembership
                :user_id  user-id
                :group_id (u/the-id (perm-group/all-users)))))
        (testing "Should not be added to Admin group"
          (is (not (db/exists? PermissionsGroupMembership
                     :user_id  user-id
                     :group_id (u/the-id (perm-group/admin))))))
        (testing "Should not be added to MetaBot group"
          (is (not (db/exists? PermissionsGroupMembership
                     :user_id  user-id
                     :group_id (u/the-id (perm-group/metabot))))))))

    (testing "superuser"
      (mt/with-temp User [{user-id :id} {:is_superuser true}]
        (testing "Should be added to All Users group"
          (is (db/exists? PermissionsGroupMembership
                :user_id  user-id
                :group_id (u/the-id (perm-group/all-users)))))
        (testing "Should be added to Admin group"
          (is (db/exists? PermissionsGroupMembership
                :user_id  user-id
                :group_id (u/the-id (perm-group/admin)))))
        (testing "Should not be added to MetaBot group"
          (is (not (db/exists? PermissionsGroupMembership
                     :user_id  user-id
                     :group_id (u/the-id (perm-group/metabot))))))))))

(defn- group-has-full-access?
  "Does a group have permissions for `object` and *all* of its children?"
  [group-id object]
  {:pre [(perms/valid-object-path? object)]}
  ;; e.g. WHERE (object || '%') LIKE '/db/1000/'
  (db/exists? Permissions
    :group_id group-id
    object    [:like (hx/concat :object (hx/literal "%"))]))

(deftest newly-created-databases-test
  (testing "magic groups should have permissions for newly created databases\n"
    (mt/with-temp Database [{database-id :id}]
      (doseq [group [(perm-group/all-users)
                     (perm-group/admin)]]
        (testing (format "Group = %s" (pr-str (:name group)))
          (group-has-full-access? (u/the-id group) (perms/object-path database-id))))
      (testing "(Except for the MetaBot, which doesn't get data permissions)"
        (is (not (group-has-full-access? (u/the-id (perm-group/metabot)) (perms/object-path database-id))))))))

(deftest no-data-perms-for-metabot-test
  (testing "Attempting to create a data permissions entry for the MetaBot should throw an Exception"
    (mt/with-temp Database [{database-id :id}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MetaBot can only have Collection permissions"
           (db/insert! Permissions :group_id (u/the-id (perm-group/metabot)), :object (perms/object-path database-id)))))))

(deftest add-remove-from-admin-group-test
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "adding user to Admin should set is_superuser -> true")
    (mt/with-temp User [{user-id :id}]
      (db/insert! PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perm-group/admin)))
      (is (= true
             (db/select-one-field :is_superuser User, :id user-id))))

    (testing "removing user from Admin should set is_superuser -> false"
      (mt/with-temp User [{user-id :id} {:is_superuser true}]
        (db/delete! PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perm-group/admin)))
        (is (= false
               (db/select-one-field :is_superuser User, :id user-id)))))

    (testing "setting is_superuser -> true should add user to Admin"
      (mt/with-temp User [{user-id :id}]
        (db/update! User user-id, :is_superuser true)
        (is (= true
               (db/exists? PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perm-group/admin)))))))

    (testing "setting is_superuser -> false should remove user from Admin"
      (mt/with-temp User [{user-id :id} {:is_superuser true}]
        (db/update! User user-id, :is_superuser false)
        (is (= false
               (db/exists? PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perm-group/admin)))))))))
