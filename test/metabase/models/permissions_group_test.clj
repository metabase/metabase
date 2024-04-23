(ns metabase.models.permissions-group-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.permissions-test-util :as perm-test-util]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.database :refer [Database]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms :refer [Permissions]]
   [metabase.models.permissions-group
    :as perms-group
    :refer [PermissionsGroup]]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.user :refer [User]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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

(deftest ^:parallel new-users-test
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
                               :group_id (u/the-id (perms-group/admin))))))))))

(deftest ^:parallel new-users-test-2
  (testing "newly created users should get added to the appropriate magic groups"
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

(mu/defn ^:private group-has-full-access?
  "Does a group have permissions for `object` and *all* of its children?"
  [group-id :- ms/PositiveInt
   db-id    :- ms/PositiveInt]
  (is (= #{:unrestricted}
         (t2/select-fn-set :value
                           :model/DataPermissions
                           {:select [[:p.perm_value :value]]
                            :from [[:data_permissions :p]]
                            :where [:and
                                    [:= :p.group_id group-id]
                                    [:= :p.perm_type (u/qualified-name :perms/view-data)]
                                    [:= :p.db_id db-id]]}))))

(deftest newly-created-databases-test
  (testing "magic groups should have permissions for newly created databases\n"
    (t2.with-temp/with-temp [Database {database-id :id}]
      (doseq [group [(perms-group/all-users)]]
        (testing (format "Group = %s" (pr-str (:name group)))
          (is (group-has-full-access? (u/the-id group) database-id)))))))

(deftest add-remove-from-admin-group-test
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "adding user to Admin should set is_superuser -> true"
      (t2.with-temp/with-temp [User {user-id :id}]
        (t2/insert! PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))
        (is (true? (t2/select-one-fn :is_superuser User, :id user-id)))))))

(deftest add-remove-from-admin-group-test-2
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "removing user from Admin should set is_superuser -> false"
      (t2.with-temp/with-temp [User {user-id :id} {:is_superuser true}]
        (t2/delete! PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))
        (is (false? (t2/select-one-fn :is_superuser User, :id user-id)))))))

(deftest add-remove-from-admin-group-test-3
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "setting is_superuser -> true should add user to Admin"
      (t2.with-temp/with-temp [User {user-id :id}]
        (t2/update! User user-id {:is_superuser true})
        (is (true? (t2/exists? PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))))

(deftest add-remove-from-admin-group-test-4
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "setting is_superuser -> false should remove user from Admin"
      (t2.with-temp/with-temp [User {user-id :id} {:is_superuser true}]
        (t2/update! User user-id {:is_superuser false})
        (is (false? (t2/exists? PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))))

(deftest data-graph-for-group-check-all-groups-test
  (doseq [group-id (t2/select-fn-set :id :model/PermissionsGroup)]
    (testing (str "testing data-graph-for-group with group-id: [" group-id "].")
      (let [graph (data-perms.graph/api-graph {:group-id group-id})]
        (is (=? {:revision pos-int?}
                graph))
        (is (perm-test-util/validate-graph-api-groups (:groups graph)))
        (is (= #{group-id} (set (keys (:groups graph)))))))))

(defn- perm-object->db [perm-obj]
  (some-> (re-find #"/db/(\d+)/" perm-obj) second parse-long))

(deftest data-graph-for-db-check-all-dbs-test
  (let [perm-objects (t2/select-fn-set :object :model/Permissions)
        dbs-in-perms (set (keep perm-object->db perm-objects))]
    (doseq [db-id (t2/select-fn-set :id :model/Database)]
      (testing (str "testing data-graph-for-db with db-id: [" db-id "].")
        (let [graph (data-perms.graph/api-graph {:db-id db-id})]
          (is (=? {:revision pos-int?}
                  graph))
          (is (perm-test-util/validate-graph-api-groups (:groups graph)))
          ;; Only check this for dbs with permissions
          (when (contains? dbs-in-perms db-id)
            (is (= #{db-id} (->> graph :groups vals (mapcat keys) set)))))))))

(deftest set-default-permission-values!-test
  (testing "A new group has permissions dynamically set for each DB based on the All Users group"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (mt/with-full-data-perms-for-all-users!
          (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
            (is
             (= {group-id
                 {db-id
                  {:perms/view-data :unrestricted
                   :perms/create-queries :query-builder-and-native
                   :perms/download-results :one-million-rows
                   :perms/manage-table-metadata :no
                   :perms/manage-database :no}}}
                (data-perms/data-permissions-graph :group-id group-id :db-id db-id))))))

      (mt/with-temp [:model/Database         {db-id :id}    {}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
            (is
             (= {group-id
                 {db-id
                  {:perms/view-data :unrestricted
                   :perms/create-queries :no
                   :perms/download-results :no
                   :perms/manage-table-metadata :no
                   :perms/manage-database :no}}}
                (data-perms/data-permissions-graph :group-id group-id :db-id db-id)))))))))
