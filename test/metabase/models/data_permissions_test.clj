(ns metabase.models.data-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(defn do-with-restored-perms!
  "Implementation of `with-restored-perms` and related helper functions. Optionally takes `group-ids` to restore only the
  permissions for a set of groups."
  [group-ids thunk]
  (let [select-condition [(when group-ids [:in :group_id group-ids])]
        original-perms (t2/select :model/DataPermissions {:where select-condition})]
    (try
      (thunk)
      (finally
        (t2/delete! :model/DataPermissions {:where select-condition})
        (t2/insert! :model/DataPermissions original-perms)))))

(defmacro with-restored-perms!
  "Runs `body`, and restores all permissions to their original state afterwards."
  [& body]
  `(do-with-restored-perms! nil (fn [] ~@body)))

(defmacro with-restored-perms-for-group!
  "Runs `body`, and restores all permissions for `group-id` to their original state afterwards."
  [group-id & body]
  `(do-with-restored-perms! [~group-id] (fn [] ~@body)))

(defmacro with-restored-perms-for-groups!
  "Runs `body`, and restores all permissions for `group-ids` to their original state afterwards."
  [group-ids & body]
  `(do-with-restored-perms! ~group-ids (fn [] ~@body)))

(deftest ^:parallel coalesce-test
  (testing "`coalesce` correctly returns the most permissive value by default"
    (are [expected args] (= expected (apply data-perms/coalesce args))
      :unrestricted    [:data-access #{:unrestricted :restricted :none}]
      :no-self-service [:data-access #{:no-self-service :none}]
      :block           [:data-access #{:block}]
      nil              [:data-access #{}])))

(deftest set-database-permission!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}    {}
                 :model/Database         {database-id :id} {}]
    (let [perm-value (fn [perm-type] (t2/select-one-fn :perm_value
                                                       :model/DataPermissions
                                                       :db_id database-id
                                                       :group_id group-id
                                                       :type perm-type))]
     (with-restored-perms-for-group! group-id
       (testing "`set-database-permission!` correctly updates an individual database's permissions"
         (data-perms/set-database-permission! group-id database-id :native-query-editing :no)
         (is (= :no (perm-value :native-query-editing)))
         (data-perms/set-database-permission! group-id database-id :native-query-editing :yes)
         (is (= :yes (perm-value :native-query-editing))))

       (testing "`set-database-permission!` sets native query permissions to :no if data access is set to :block"
         (data-perms/set-database-permission! group-id database-id :data-access :block)
         (is (= :block (perm-value :data-access)))
         (is (= :no (perm-value :native-query-editing))))

       (testing "A database-level permission cannot be set to an invalid value"
         (is (thrown-with-msg?
              ExceptionInfo
              #"Permission type :native-query-editing cannot be set to :invalid-value"
              (data-perms/set-database-permission! group-id database-id :native-query-editing :invalid-value))))))))

(deftest set-table-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}      {}
                 :model/Database         {database-id :id}   {}
                 :model/Database         {database-id-2 :id} {}
                 :model/Table            {table-id-1 :id
                                          :as table-1}       {:db_id database-id}
                 :model/Table            {table-id-2 :id}    {:db_id database-id}
                 :model/Table            {table-id-3 :id}    {:db_id database-id}
                 :model/Table            {table-id-4 :id}    {:db_id database-id-2}]
    (let [data-access-perm-value (fn [table-id] (t2/select-one-fn :perm_value :model/DataPermissions
                                                                  :db_id database-id
                                                                  :group_id group-id
                                                                  :table_id table-id
                                                                  :type :data-access))]
      (with-restored-perms-for-group! group-id
        (testing "`set-table-permissions!` can set individual table permissions to different values"
          (data-perms/set-table-permissions! group-id :data-access {table-id-1 :no-self-service
                                                                    table-id-2 :unrestricted
                                                                    table-id-3 :no-self-service})
          (is (= :no-self-service (data-access-perm-value table-id-1)))
          (is (= :unrestricted    (data-access-perm-value table-id-2)))
          (is (= :no-self-service (data-access-perm-value table-id-3))))

        (testing "`set-table-permissions!` can set individual table permissions passed in as the full tables"
          (data-perms/set-table-permissions! group-id :data-access {table-1 :unrestricted})
          (is (= :unrestricted (data-access-perm-value table-id-1))))

        (testing "`set-table-permission!` coalesces table perms to a DB-level value if they're all the same"
          (data-perms/set-table-permissions! group-id :data-access {table-id-1 :no-self-service
                                                                    table-id-2 :no-self-service})
          (is (= :no-self-service (data-access-perm-value nil)))
          (is (nil?               (data-access-perm-value table-id-1)))
          (is (nil?               (data-access-perm-value table-id-2)))
          (is (nil?               (data-access-perm-value table-id-3))))

        (testing "`set-table-permission!` breaks table perms out again if any are modified"
          (data-perms/set-table-permissions! group-id :data-access {table-id-2 :unrestricted
                                                                    table-id-3 :no-self-service})
          (is (nil?               (data-access-perm-value nil)))
          (is (= :no-self-service (data-access-perm-value table-id-1)))
          (is (= :unrestricted    (data-access-perm-value table-id-2)))
          (is (= :no-self-service (data-access-perm-value table-id-3))))

        (testing "A non table-level permission cannot be set"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Permission type :native-query-editing cannot be set on tables."
               (data-perms/set-table-permissions! group-id :native-query-editing {table-id-1 :yes}))))

        (testing "A table-level permission cannot be set to an invalid value"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Permission type :data-access cannot be set to :invalid"
               (data-perms/set-table-permissions! group-id :data-access {table-id-1 :invalid}))))

        (testing "A table-level permission cannot be set to :block"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Block permissions must be set at the database-level only."
               (data-perms/set-table-permissions! group-id :data-access {table-id-1 :block}))))

        (testing "Table-level permissions can only be set in bulk for tables in the same database"
          (is (thrown-with-msg?
               ExceptionInfo
               #"All tables must belong to the same database."
               (data-perms/set-table-permissions! group-id :data-access {table-id-3 :unrestricted
                                                                         table-id-4 :unrestricted}))))

        (testing "Setting block permissions at the database level clears table-level data access perms"
          (data-perms/set-database-permission! group-id database-id :data-access :block)
          (is (= :block (data-access-perm-value nil)))
          (is (nil?     (data-access-perm-value table-id-1)))
          (is (nil?     (data-access-perm-value table-id-2)))
          (is (nil?     (data-access-perm-value table-id-3))))))))

(deftest database-permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}    {}
                 :model/PermissionsGroup           {group-id-2 :id}    {}
                 :model/User                       {user-id :id}       {}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id
                                                                        :group_id group-id-1}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id
                                                                        :group_id group-id-2}
                 :model/Database                   {database-id-1 :id} {}
                 :model/Database                   {database-id-2 :id} {}]
    (with-restored-perms-for-groups! [group-id-1 group-id-2]
      (testing "`database-permission-for-user` coalesces permissions from all groups a user is in"
        (data-perms/set-database-permission! group-id-1 database-id-1 :native-query-editing :yes)
        (data-perms/set-database-permission! group-id-2 database-id-1 :native-query-editing :no)
        (is (= :yes (data-perms/database-permission-for-user user-id :native-query-editing database-id-1))))

      (testing "`database-permission-for-user` falls back to the least permissive value if no value exists for the user"
        (t2/delete! :model/DataPermissions :db_id database-id-2)
        (is (= :no (data-perms/database-permission-for-user user-id :native-query-editing database-id-2))))

      (testing "Admins always have the most permissive value, regardless of group membership"
        (is (= :yes (data-perms/database-permission-for-user (mt/user->id :crowberto) :native-query-editing database-id-2)))))))

(deftest table-permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}  {}
                 :model/PermissionsGroup           {group-id-2 :id}  {}
                 :model/User                       {user-id :id}     {}
                 :model/PermissionsGroupMembership {}                {:user_id  user-id
                                                                      :group_id group-id-1}
                 :model/PermissionsGroupMembership {}                {:user_id  user-id
                                                                      :group_id group-id-2}
                 :model/Database                   {database-id :id} {}
                 :model/Table                      {table-id-1 :id}  {:db_id database-id}
                 :model/Table                      {table-id-2 :id}  {:db_id database-id}]
    (with-restored-perms-for-groups! [group-id-1 group-id-2]
      (testing "`table-permission-for-user` coalesces permissions from all groups a user is in"
        (data-perms/set-table-permission! group-id-1 table-id-1 :data-access :unrestricted)
        (data-perms/set-table-permission! group-id-2 table-id-1 :data-access :no-self-service)
        (is (= :unrestricted (data-perms/table-permission-for-user user-id :data-access database-id table-id-1))))

      (testing "`table-permission-for-user` falls back to the least permissive value if no value exists for the user"
        (t2/delete! :model/DataPermissions :db_id database-id)
        (is (= :block (data-perms/table-permission-for-user user-id :data-access database-id table-id-2))))

      (testing "Admins always have the most permissive value, regardless of group membership"
        (is (= :unrestricted (data-perms/table-permission-for-user (mt/user->id :crowberto) :data-access database-id table-id-2)))))))

(deftest data-permissions-graph-test
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                 :model/PermissionsGroup {group-id-2 :id}      {}
                 :model/Database         {database-id-1 :id}   {}
                 :model/Database         {database-id-2 :id}   {}
                 :model/Table            {table-id-1 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-2 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-3 :id}      {:db_id database-id-2
                                                                :schema nil}]
    (with-restored-perms-for-groups! [group-id-1 group-id-2]
      ;; Clear the default permissions for the groups
      (t2/delete! :model/DataPermissions :group_id group-id-1)
      (t2/delete! :model/DataPermissions :group_id group-id-2)
      (testing "Data access and native query permissions can be fetched as a graph"
        (data-perms/set-table-permission! group-id-1 table-id-1 :data-access :unrestricted)
        (data-perms/set-table-permission! group-id-1 table-id-2 :data-access :no-self-service)
        (data-perms/set-table-permission! group-id-1 table-id-3 :data-access :unrestricted)
        (data-perms/set-database-permission! group-id-1 database-id-1 :native-query-editing :yes)
        (data-perms/set-database-permission! group-id-1 database-id-2 :native-query-editing :no)
        (data-perms/set-table-permission! group-id-2 table-id-1 :data-access :no-self-service)
        (is (partial=
             {group-id-1
              {database-id-1 {:data-access
                              {"PUBLIC"
                               {table-id-1 :unrestricted
                                table-id-2 :no-self-service}}
                              :native-query-editing :yes}
               database-id-2 {:data-access
                              {""
                               {table-id-3 :unrestricted}}
                              :native-query-editing :no}}
              group-id-2
              {database-id-1 {:data-access
                              {"PUBLIC"
                               {table-id-1 :no-self-service}}}}}
             (data-perms/data-permissions-graph))))

      (testing "Additional data permissions are included when set"
        (data-perms/set-table-permission! group-id-1 table-id-3 :download-results :one-million-rows)
        (data-perms/set-table-permission! group-id-1 table-id-1 :manage-table-metadata :yes)
        (data-perms/set-database-permission! group-id-1 database-id-2 :manage-database :yes)
        (is (partial=
             {group-id-1
              {database-id-1 {:manage-table-metadata
                              {"PUBLIC"
                               {table-id-1 :yes}}}
               database-id-2 {:download-results
                              {""
                               {table-id-3 :one-million-rows}}
                              :manage-database :yes}}}
             (data-perms/data-permissions-graph))))

      (testing "Data permissions graph can be filtered by group ID, database ID, and permission type"
        (is (= {group-id-1
                {database-id-1 {:data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :no-self-service}}
                                :native-query-editing :yes
                                :manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}
                 database-id-2 {:data-access
                                {""
                                 {table-id-3 :unrestricted}}
                                :download-results
                                {""
                                 {table-id-3 :one-million-rows}}
                                :manage-database :yes
                                :native-query-editing :no}}}
               (data-perms/data-permissions-graph :group-id group-id-1)))

        (is (= {group-id-1
                {database-id-1 {:data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :no-self-service}}
                                :native-query-editing :yes
                                :manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}}}
               (data-perms/data-permissions-graph :group-id group-id-1
                                                  :db-id database-id-1)))

        (is (= {group-id-1
                {database-id-1 {:data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :no-self-service}}}}}
               (data-perms/data-permissions-graph :group-id group-id-1
                                                  :db-id database-id-1
                                                  :perm-type :data-access)))))))
