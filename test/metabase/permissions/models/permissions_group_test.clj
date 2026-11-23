(ns metabase.permissions.models.permissions-group-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions-rest.api-test-util :as perm-test-util]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest ^:parallel group-display-name-preserves-stored-name-test
  (let [group {:magic_group_type perms-group/all-users-magic-group-type :name "Stored group name"}]
    (is (= "Stored group name" (perms-group/group-display-name group false)))
    (is (= "All internal users" (perms-group/group-display-name group true)))))

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
               (perms-group/delete-permissions-groups! [(u/the-id group)]))))
        (testing "make sure we're not allowed to edit the magic groups"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"You cannot edit or delete the .* permissions group"
               (perms-group/update-permissions-groups! [{:id (u/the-id group) :name "Cool People"}]))))))))

(deftest new-users-test
  (testing "newly created users should get added to the appropriate magic groups"
    (testing "regular user"
      (mt/with-model-cleanup [:model/User]
        (let [[{user-id :id}] (user/create-users! [{:email "new-regular-user@example.com"}])]
          (testing "Should be added to All Users group"
            (is (t2/exists? :model/PermissionsGroupMembership
                            :user_id  user-id
                            :group_id (u/the-id (perms-group/all-users)))))
          (testing "Should not be added to Admin group"
            (is (not (t2/exists? :model/PermissionsGroupMembership
                                 :user_id  user-id
                                 :group_id (u/the-id (perms-group/admin)))))))))))

(deftest new-users-test-2
  (testing "newly created users should get added to the appropriate magic groups"
    (testing "superuser"
      (mt/with-model-cleanup [:model/User]
        (let [[{user-id :id}] (user/create-users! [{:email "new-superuser@example.com" :is_superuser true}])]
          (testing "Should be added to All Users group"
            (is (t2/exists? :model/PermissionsGroupMembership
                            :user_id  user-id
                            :group_id (u/the-id (perms-group/all-users)))))
          (testing "Should be added to Admin group"
            (is (t2/exists? :model/PermissionsGroupMembership
                            :user_id  user-id
                            :group_id (u/the-id (perms-group/admin))))))))))

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

(deftest all-tenant-users-get-least-access-to-newly-created-databases-test
  (let [group-id (u/the-id (perms-group/all-external-users))]
    (mt/with-restored-data-perms-for-group! group-id
      (doseq [database-id (t2/select-pks-set :model/Database :router_database_id nil)]
        (perms/set-database-permission! group-id database-id :perms/view-data :unrestricted)
        (perms/set-database-permission! group-id database-id :perms/create-queries :query-builder-and-native)
        (perms/set-database-permission! group-id database-id :perms/download-results :one-million-rows))
      (mt/with-model-cleanup [:model/Database]
        (let [database-id (:id (first (database/create-databases! [{:name "Test" :engine :h2 :details {}}])))]
          (is (= {:perms/view-data      :blocked
                  :perms/create-queries :no}
                 (t2/select-fn->fn :perm_type :perm_value :model/DataPermissions
                                   :group_id group-id
                                   :db_id database-id
                                   :perm_type [:in [:perms/view-data :perms/create-queries]]))))))))

(deftest add-remove-from-admin-group-test
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "adding user to Admin should set is_superuser -> true"
      (mt/with-temp [:model/User {user-id :id}]
        (perms-group-membership/add-users-to-groups! [{:user user-id :group (u/the-id (perms-group/admin))}])
        (is (true? (t2/select-one-fn :is_superuser :model/User, :id user-id)))))))

(deftest add-remove-from-admin-group-test-2
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "removing user from Admin should set is_superuser -> false"
      (mt/with-model-cleanup [:model/User]
        (let [[{user-id :id}] (user/create-users! [{:email "removed-admin@example.com" :is_superuser true}])]
          (perms-group-membership/remove-users-from-groups! [user-id] [(perms-group/admin)])
          (is (false? (t2/select-one-fn :is_superuser :model/User, :id user-id))))))))

(deftest add-remove-from-admin-group-test-3
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "setting is_superuser -> true should add user to Admin"
      (mt/with-temp [:model/User {user-id :id}]
        (user/update-users! [{:id user-id :is_superuser true}])
        (is (true? (t2/exists? :model/PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin)))))))))

(deftest add-remove-from-admin-group-test-4
  (testing "flipping the is_superuser bit should add/remove user from Admin group as appropriate"
    (testing "setting is_superuser -> false should remove user from Admin"
      (mt/with-model-cleanup [:model/User]
        (let [[{user-id :id}] (user/create-users! [{:email "demoted-admin@example.com" :is_superuser true}])]
          (user/update-users! [{:id user-id :is_superuser false}])
          (is (false? (t2/exists? :model/PermissionsGroupMembership, :user_id user-id, :group_id (u/the-id (perms-group/admin))))))))))

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
          (mt/with-model-cleanup [:model/PermissionsGroup]
            (let [[{group-id :id}] (perms-group/create-permissions-groups! [{:name "Default Values Full"}])]
              (is
               (= {group-id
                   {db-id
                    {:perms/view-data :unrestricted
                     :perms/create-queries :query-builder-and-native
                     :perms/download-results :one-million-rows
                     :perms/manage-table-metadata :no
                     :perms/manage-database :no}}}
                  (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id)))))))
      (mt/with-temp [:model/Database         {db-id :id}    {}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-model-cleanup [:model/PermissionsGroup]
            (let [[{group-id :id}] (perms-group/create-permissions-groups! [{:name "Default Values None"}])]
              (is
               (= {group-id
                   {db-id
                    ;; When EE code is on the classpath, a new group fails CLOSED to :blocked for a DB
                    ;; where All Users is blocked, regardless of token features (UXW-4927); only a true
                    ;; OSS jar falls back to :unrestricted.
                    {:perms/view-data (if config/ee-available? :blocked :unrestricted)
                     :perms/create-queries :no
                     :perms/download-results :no
                     :perms/manage-table-metadata :no
                     :perms/manage-database :no
                     :perms/transforms :no}}}
                  (data-perms.graph/data-permissions-graph :group-id group-id :db-id db-id))))))))))

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

(deftest group-tenancy-and-type-are-frozen-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (testing "changing whether a group is a tenant group is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"tenant group"
                            (t2/update! :model/PermissionsGroup :id group-id {:is_tenant_group true})))
      (is (false? (t2/select-one-fn :is_tenant_group :model/PermissionsGroup :id group-id))))
    (testing "changing the type of a group is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"type of a group"
                            (t2/update! :model/PermissionsGroup :id group-id {:magic_group_type "data-analyst"})))
      (is (nil? (t2/select-one-fn :magic_group_type :model/PermissionsGroup :id group-id))))
    (testing "renaming a group that is not magic works"
      (t2/update! :model/PermissionsGroup :id group-id {:name "Renamed Test Group"})
      (is (= "Renamed Test Group" (t2/select-one-fn :name :model/PermissionsGroup :id group-id))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/PermissionsGroup]
    (let [create! (fn [n]
                    (perms-group/create-permissions-groups!
                     (mapv (fn [i] (cond-> {:name (mt/random-name)} (odd? i) (assoc :is_tenant_group true))) (range n))))
          counted (fn [write! n]
                    (let [groups (create! n)]
                      (events.tu/statement-count! #(write! groups))))]
      (testing "creating groups, regular and tenant ones"
        (events.tu/statement-count! #(create! 1))
        (is (= (events.tu/statement-count! #(create! 2))
               (events.tu/statement-count! #(create! 6)))))
      (testing "updating groups that keep their names"
        (let [update! (fn [groups]
                        (perms-group/update-permissions-groups! (mapv #(select-keys % [:id :name]) groups)))]
          (counted update! 1)
          (let [c2 (counted update! 2) c4 (counted update! 4) c6 (counted update! 6)]
            (testing "an update grows by each row's own statements only, its hook's SELECT and its UPDATE"
              (is (= (- c6 c4) (- c4 c2)))))))
      (testing "deleting groups, some of them in the LDAP group mappings"
        (let [delete! (fn [groups]
                        (mt/with-temporary-setting-values [ldap-group-mappings {"cn=Test,dc=example,dc=com"
                                                                                (into [] (comp (take-nth 2) (map :id)) groups)}]
                          (perms-group/delete-permissions-groups! (mapv :id groups))))]
          (counted delete! 1)
          (is (= (counted delete! 2) (counted delete! 6))))))))

(deftest create-permissions-groups-refuses-taken-names-test
  (mt/with-model-cleanup [:model/PermissionsGroup]
    (let [[existing] (perms-group/create-permissions-groups! [{:name (mt/random-name)}])
          fresh      (mt/random-name)]
      (testing "the name of an existing group, in another case, writes nothing"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A group with that name already exists"
                              (perms-group/create-permissions-groups! [{:name fresh} {:name (u/upper-case-en (:name existing))}])))
        (is (not (t2/exists? :model/PermissionsGroup :name fresh))))
      (testing "two rows of one call with the same name, in another case, write nothing"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A group with that name already exists"
                              (perms-group/create-permissions-groups! [{:name fresh} {:name (u/upper-case-en fresh)}])))
        (is (not (t2/exists? :model/PermissionsGroup :name fresh))))
      (testing "groups with free names get the default permissions of every Database"
        (let [groups (perms-group/create-permissions-groups! [{:name fresh} {:name (mt/random-name) :is_tenant_group true}])]
          (is (= [fresh false] ((juxt :name :is_tenant_group) (first groups))))
          (doseq [group groups]
            (is (t2/exists? :model/DataPermissions :group_id (:id group) :db_id (mt/id)))))))))

(deftest delete-permissions-groups-refuses-magic-groups-test
  (mt/with-model-cleanup [:model/PermissionsGroup]
    (let [[group] (perms-group/create-permissions-groups! [{:name (mt/random-name)}])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot edit or delete"
                            (perms-group/delete-permissions-groups! [(:id group) (:id (perms-group/admin))])))
      (is (t2/exists? :model/PermissionsGroup :id (:id group))))))

(deftest delete-permissions-groups-drops-them-from-ldap-group-mappings-test
  (mt/with-model-cleanup [:model/PermissionsGroup]
    (let [[kept dropped-1 dropped-2] (perms-group/create-permissions-groups! (vec (repeatedly 3 #(hash-map :name (mt/random-name)))))]
      (mt/with-temporary-setting-values [ldap-group-mappings {"cn=A,dc=example,dc=com" [(:id kept) (:id dropped-1)]
                                                              "cn=B,dc=example,dc=com" [(:id dropped-2)]}]
        (perms-group/delete-permissions-groups! [(:id dropped-1) (:id dropped-2)])
        (is (= {"cn=A,dc=example,dc=com" [(:id kept)]
                "cn=B,dc=example,dc=com" []}
               (update-keys (setting/get :ldap-group-mappings) str)))))))

(deftest update-permissions-groups-refuses-in-input-order-test
  (mt/with-model-cleanup [:model/PermissionsGroup]
    (let [[group taken] (perms-group/create-permissions-groups! [{:name (mt/random-name)} {:name (mt/random-name)}])]
      (testing "the first refused row gives the message"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"tenant group"
                              (perms-group/update-permissions-groups! [{:id (:id group) :is_tenant_group true}
                                                                       {:id (:id taken) :name (:name group)}])))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A group with that name already exists"
                              (perms-group/update-permissions-groups! [{:id (:id taken) :name (:name group)}
                                                                       {:id (:id group) :is_tenant_group true}]))))
      (testing "a rename sees the rename of an earlier row"
        (let [new-name (mt/random-name)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A group with that name already exists"
                                (perms-group/update-permissions-groups! [{:id (:id group) :name new-name}
                                                                         {:id (:id taken) :name new-name}])))
          (is (= [(:name group) (:name taken)]
                 (mapv #(t2/select-one-fn :name :model/PermissionsGroup :id (:id %)) [group taken]))))))))

(deftest update-permissions-groups-frees-name-renamed-away-in-same-call-test
  (mt/with-temp [:model/PermissionsGroup {first-id :id}  {:name "Chain First Group"}
                 :model/PermissionsGroup {second-id :id} {:name "Chain Second Group"}]
    (perms-group/update-permissions-groups! [{:id first-id :name "Chain Second Group"} {:id second-id :name "Chain Third Group"}])
    (is (= ["Chain Second Group" "Chain Third Group"]
           (mapv #(t2/select-one-fn :name :model/PermissionsGroup :id %) [first-id second-id])))))
