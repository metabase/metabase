(ns metabase.permissions.models.permissions-group-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions-rest.api-test-util :as perm-test-util]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest admin-root-entry-test
  (testing "Check that the root entry for Admin was created"
    (is (t2/exists? :model/Permissions :group_id (u/the-id (perms-group/admin)), :object "/"))))

(deftest magic-groups-test
  (testing "check that we can get the magic permissions groups through the helper functions\n"
    (doseq [[group-name group magic-group-type]
            [["All Users"      (perms-group/all-users) perms-group/all-users-magic-group-type]
             ["Administrators" (perms-group/admin)     perms-group/admin-magic-group-type]]]
      (testing group-name
        (is (mi/instance-of? :model/PermissionsGroup group))
        (is (= group-name
               (:name group)))
        (is (= magic-group-type
               (:magic_group_type group)))
        (testing "make sure we're not allowed to delete the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (t2/delete! :model/PermissionsGroup :id (u/the-id group)))))
        (testing "make sure we're not allowed to edit the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (t2/update! :model/PermissionsGroup (u/the-id group) {:name "Cool People"}))))))))

(deftest ^:parallel new-users-test
  (testing "newly created users should get added to the appropriate magic groups"
    (testing "regular user"
      (mt/with-temp [:model/User {user-id :id}]
        (testing "Should be added to All Users group"
          (is (t2/exists? :model/PermissionsGroupMembership
                          :user_id  user-id
                          :group_id (u/the-id (perms-group/all-users)))))
        (testing "Should not be added to Admin group"
          (is (not (t2/exists? :model/PermissionsGroupMembership
                               :user_id  user-id
                               :group_id (u/the-id (perms-group/admin))))))))))

(deftest ^:parallel new-users-test-2
  (testing "newly created users should get added to the appropriate magic groups"
    (testing "superuser"
      (mt/with-temp [:model/User {user-id :id} {:is_superuser true}]
        (testing "Should be added to All Users group"
          (is (t2/exists? :model/PermissionsGroupMembership
                          :user_id  user-id
                          :group_id (u/the-id (perms-group/all-users)))))
        (testing "Should be added to Admin group"
          (is (t2/exists? :model/PermissionsGroupMembership
                          :user_id  user-id
                          :group_id (u/the-id (perms-group/admin)))))))))

(mu/defn- group-has-full-access?
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
    (mt/with-temp [:model/Database {database-id :id}]
      (doseq [group [(perms-group/all-users)]]
        (testing (format "Group = %s" (pr-str (:name group)))
          (is (group-has-full-access? (u/the-id group) database-id)))))))

(deftest add-remove-from-admin-group-test
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "adding user to Admin should set is_superuser -> true"
      (mt/with-temp [:model/User {user-id :id}]
        (perms/add-user-to-group! user-id (u/the-id (perms-group/admin)))
        (is (true? (t2/select-one-fn :is_superuser :model/User, :id user-id)))))))

(deftest add-remove-from-admin-group-test-2
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "removing user from Admin should set is_superuser -> false"
      (mt/with-temp [:model/User {user-id :id} {:is_superuser true}]
        (t2/delete! :model/PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))
        (is (false? (t2/select-one-fn :is_superuser :model/User, :id user-id)))))))

(deftest add-remove-from-admin-group-test-3
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "setting is_superuser -> true should add user to Admin"
      (mt/with-temp [:model/User {user-id :id}]
        (t2/update! :model/User user-id {:is_superuser true})
        (is (true? (t2/exists? :model/PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))))

(deftest add-remove-from-admin-group-test-4
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "setting is_superuser -> false should remove user from Admin"
      (mt/with-temp [:model/User {user-id :id} {:is_superuser true}]
        (t2/update! :model/User user-id {:is_superuser false})
        (is (false? (t2/exists? :model/PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))))

(deftest data-graph-for-group-check-all-groups-test
  (mt/with-temp [:model/PermissionsGroup {} {}
                 :model/Database         {} {}]
    (doseq [group-id (t2/select-fn-set :id :model/PermissionsGroup :is_tenant_group false)]
      (testing (str "testing data-graph-for-group with group-id: [" group-id "].")
        (let [graph (data-perms.graph/api-graph {:group-id group-id})]
          (is (malli= [:map [:revision :int] [:groups :map]] graph))
          (is (perm-test-util/validate-graph-api-groups (:groups graph)))
          (is (= #{group-id} (set (keys (:groups graph))))))))))

(defn- perm-object->db [perm-obj]
  (some-> (re-find #"/db/(\d+)/" perm-obj) second parse-long))

(deftest data-graph-for-db-check-all-dbs-test
  (let [perm-objects (t2/select-fn-set :object :model/Permissions)
        dbs-in-perms (set (keep perm-object->db perm-objects))]
    (doseq [db-id (t2/select-fn-set :id :model/Database)]
      (testing (str "testing data-graph-for-db with db-id: [" db-id "].")
        (let [graph (data-perms.graph/api-graph {:db-id db-id})]
          (is (=? {:revision (every-pred int? (complement neg?))}
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
                (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id))))))

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
                   :perms/manage-database :no
                   :perms/transforms :no}}}
                (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id)))))))))

(deftest hydrate-members-tests
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}         {}
                 :model/PermissionsGroup           {group-id-2 :id}         {}
                 :model/User                       {user-1-g1 :id}          {:first_name "a"}
                 :model/User                       {user-2-g1 :id}          {:first_name "b"}
                 :model/User                       {user-3-g1-inacitve :id} {:is_active false}
                 :model/User                       {user-1-g2 :id}          {}
                 :model/PermissionsGroupMembership _                        {:user_id user-1-g1 :group_id group-id-1 :is_group_manager true}
                 :model/PermissionsGroupMembership _                        {:user_id user-2-g1 :group_id group-id-1}
                 :model/PermissionsGroupMembership _                        {:user_id user-3-g1-inacitve :group_id group-id-1}
                 :model/PermissionsGroupMembership _                        {:user_id user-1-g2 :group_id group-id-2}]
    (let [group-id->members (fn []
                              (as-> (t2/select :model/PermissionsGroup :id [:in [group-id-1 group-id-2]]) results
                                (t2/hydrate results :members)
                                (map (juxt :id :members) results)
                                (into {} results)
                                (update-vals results (fn [members]
                                                       (set (map #(select-keys % [:id :is_group_manager]) members))))))]

      (testing "hydrate members only return active users for each group"
        (is (= {group-id-1 #{{:id user-1-g1}
                             {:id user-2-g1}}
                group-id-2 #{{:id user-1-g2}}}
               (group-id->members))))

      (testing "return is_group_manager for each group if premium features are enabled"
        (when config/ee-available?
          (mt/with-premium-features #{:advanced-permissions}
            (is (= {group-id-1 #{{:id user-1-g1 :is_group_manager true}
                                 {:id user-2-g1 :is_group_manager false}}
                    group-id-2 #{{:id user-1-g2 :is_group_manager false}}}
                   (group-id->members)))))))))

(deftest is-tenant-group?-works
  (mt/with-temp [:model/PermissionsGroup {:as normal-group} {:is_tenant_group false}
                 :model/PermissionsGroup {:as tenant-group} {:is_tenant_group true}]
    (is (= true
           (perms-group/is-tenant-group? tenant-group)
           (perms-group/is-tenant-group? (u/the-id tenant-group))))
    (is (= false
           (perms-group/is-tenant-group? normal-group)
           (perms-group/is-tenant-group? (u/the-id normal-group))))))
