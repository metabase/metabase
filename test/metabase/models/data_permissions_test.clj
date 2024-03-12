(ns metabase.models.data-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest ^:parallel coalesce-test
  (testing "`coalesce` correctly returns the most permissive value by default"
    (are [expected args] (= expected (apply data-perms/coalesce args))
      :unrestricted    [:perms/data-access #{:unrestricted :restricted :none}]
      :no-self-service [:perms/data-access #{:no-self-service :none}]
      :block           [:perms/data-access #{:block}]
      nil              [:perms/data-access #{}])))

(deftest ^:parallel at-least-as-permissive?-test
  (testing "at-least-as-permissive? correctly compares permission values"
   (is (data-perms/at-least-as-permissive? :perms/data-access :unrestricted :unrestricted))
   (is (data-perms/at-least-as-permissive? :perms/data-access :unrestricted :no-self-service))
   (is (data-perms/at-least-as-permissive? :perms/data-access :unrestricted :block))
   (is (not (data-perms/at-least-as-permissive? :perms/data-access :no-self-service :unrestricted)))
   (is (data-perms/at-least-as-permissive? :perms/data-access :no-self-service :no-self-service))
   (is (data-perms/at-least-as-permissive? :perms/data-access :no-self-service :block))
   (is (not (data-perms/at-least-as-permissive? :perms/data-access :block :unrestricted)))
   (is (not (data-perms/at-least-as-permissive? :perms/data-access :block :no-self-service)))
   (is (data-perms/at-least-as-permissive? :perms/data-access :block :block))))

(deftest set-database-permission!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}    {}
                 :model/Database         {database-id :id} {}]
    (let [perm-value (fn [perm-type] (t2/select-one-fn :perm_value
                                                       :model/DataPermissions
                                                       :db_id     database-id
                                                       :group_id  group-id
                                                       :perm_type perm-type))]
     (mt/with-restored-data-perms-for-group! group-id
       (testing "`set-database-permission!` correctly updates an individual database's permissions"
         (data-perms/set-database-permission! group-id database-id :perms/native-query-editing :no)
         (is (= :no (perm-value :perms/native-query-editing)))
         (data-perms/set-database-permission! group-id database-id :perms/native-query-editing :yes)
         (is (= :yes (perm-value :perms/native-query-editing))))

       (testing "`set-database-permission!` sets native query permissions to :no if data access is set to :block"
         (data-perms/set-database-permission! group-id database-id :perms/data-access :block)
         (is (= :block (perm-value :perms/data-access)))
         (is (= :no (perm-value :perms/native-query-editing))))

       (testing "A database-level permission cannot be set to an invalid value"
         (is (thrown-with-msg?
              ExceptionInfo
              #"Permission type :perms/native-query-editing cannot be set to :invalid-value"
              (data-perms/set-database-permission! group-id database-id :perms/native-query-editing :invalid-value))))))))

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
                                                                  :db_id     database-id
                                                                  :group_id  group-id
                                                                  :table_id  table-id
                                                                  :perm_type :perms/data-access))]
      (mt/with-restored-data-perms-for-group! group-id
        (testing "`set-table-permissions!` can set individual table permissions to different values"
          (data-perms/set-table-permissions! group-id :perms/data-access {table-id-1 :no-self-service
                                                                          table-id-2 :unrestricted
                                                                          table-id-3 :no-self-service})
          (is (= :no-self-service (data-access-perm-value table-id-1)))
          (is (= :unrestricted    (data-access-perm-value table-id-2)))
          (is (= :no-self-service (data-access-perm-value table-id-3))))

        (testing "`set-table-permissions!` can set individual table permissions passed in as the full tables"
          (data-perms/set-table-permissions! group-id :perms/data-access {table-1 :unrestricted})
          (is (= :unrestricted (data-access-perm-value table-id-1))))

        (testing "`set-table-permission!` coalesces table perms to a DB-level value if they're all the same"
          (data-perms/set-table-permissions! group-id :perms/data-access {table-id-1 :no-self-service
                                                                          table-id-2 :no-self-service})
          (is (= :no-self-service (data-access-perm-value nil)))
          (is (nil?               (data-access-perm-value table-id-1)))
          (is (nil?               (data-access-perm-value table-id-2)))
          (is (nil?               (data-access-perm-value table-id-3))))

        (testing "`set-table-permission!` breaks table perms out again if any are modified"
          (data-perms/set-table-permissions! group-id :perms/data-access {table-id-2 :unrestricted
                                                                          table-id-3 :no-self-service})
          (is (nil?               (data-access-perm-value nil)))
          (is (= :no-self-service (data-access-perm-value table-id-1)))
          (is (= :unrestricted    (data-access-perm-value table-id-2)))
          (is (= :no-self-service (data-access-perm-value table-id-3))))

        (testing "A non table-level permission cannot be set"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Permission type :perms/native-query-editing cannot be set on tables."
               (data-perms/set-table-permissions! group-id :perms/native-query-editing {table-id-1 :yes}))))

        (testing "A table-level permission cannot be set to an invalid value"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Permission type :perms/data-access cannot be set to :invalid"
               (data-perms/set-table-permissions! group-id :perms/data-access {table-id-1 :invalid}))))

        (testing "A table-level permission cannot be set to :block"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Block permissions must be set at the database-level only."
               (data-perms/set-table-permissions! group-id :perms/data-access {table-id-1 :block}))))

        (testing "Table-level permissions can only be set in bulk for tables in the same database"
          (is (thrown-with-msg?
               ExceptionInfo
               #"All tables must belong to the same database."
               (data-perms/set-table-permissions! group-id :perms/data-access {table-id-3 :unrestricted
                                                                               table-id-4 :unrestricted}))))

        (testing "Setting block permissions at the database level clears table-level data access perms"
          (data-perms/set-database-permission! group-id database-id :perms/data-access :block)
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
    (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
      (testing "`database-permission-for-user` coalesces permissions from all groups a user is in"
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/native-query-editing :yes)
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/native-query-editing :no)
        (is (= :yes (data-perms/database-permission-for-user user-id :perms/native-query-editing database-id-1))))

      (testing "`database-permission-for-user` falls back to the least permissive value if no value exists for the user"
        (t2/delete! :model/DataPermissions :db_id database-id-2)
        (is (= :no (data-perms/database-permission-for-user user-id :perms/native-query-editing database-id-2))))

      (testing "Admins always have the most permissive value, regardless of group membership"
        (is (= :yes (data-perms/database-permission-for-user (mt/user->id :crowberto) :perms/native-query-editing database-id-2)))))

    (testing "caching works as expected"
      (binding [api/*current-user-id* user-id]
        (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
          (data-perms/set-database-permission! group-id-1 database-id-1 :perms/native-query-editing :yes)
          (data-perms/with-relevant-permissions-for-user user-id
            ;; retrieve the cache now so it doesn't get counted in the call-count
            @data-perms/*permissions-for-user*
            ;; make the cache wrong
            (data-perms/set-database-permission! group-id-1 database-id-1 :perms/native-query-editing :no)
            ;; the cached value is used
            (t2/with-call-count [call-count]
              (is (= :yes (data-perms/database-permission-for-user user-id :perms/native-query-editing database-id-1)))
              (is (zero? (call-count))))))))))

(deftest table-permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}  {}
                 :model/PermissionsGroup           {group-id-2 :id}  {}
                 :model/User                       {user-id   :id}   {}
                 :model/PermissionsGroupMembership {}                {:user_id  user-id
                                                                      :group_id group-id-1}
                 :model/PermissionsGroupMembership {}                {:user_id  user-id
                                                                      :group_id group-id-2}
                 :model/Database                   {database-id :id} {}
                 :model/Table                      {table-id-1 :id}  {:db_id database-id}
                 :model/Table                      {table-id-2 :id}  {:db_id database-id}]
    (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
      (testing "`table-permission-for-user` coalesces permissions from all groups a user is in"
        (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
        (data-perms/set-table-permission! group-id-2 table-id-1 :perms/data-access :no-self-service)
        (is (= :unrestricted (data-perms/table-permission-for-user user-id :perms/data-access database-id table-id-1))))

      (testing "`table-permission-for-user` falls back to the least permissive value if no value exists for the user"
        (t2/delete! :model/DataPermissions :db_id database-id)
        (is (= :block (data-perms/table-permission-for-user user-id :perms/data-access database-id table-id-2))))

      (testing "Admins always have the most permissive value, regardless of group membership"
        (is (= :unrestricted (data-perms/table-permission-for-user (mt/user->id :crowberto) :perms/data-access database-id table-id-2)))))
    (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
      (testing "caching works as expected"
        (binding [api/*current-user-id* user-id]
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
          (data-perms/with-relevant-permissions-for-user user-id
            ;; retrieve the cache now so it doesn't get counted in the call count
            @data-perms/*permissions-for-user*
            ;; make the cache wrong
            (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :no-self-service)
            ;; the cached value is used
            (t2/with-call-count [call-count]
              (is (= :unrestricted (data-perms/table-permission-for-user user-id :perms/data-access database-id table-id-1)))
              (is (zero? (call-count))))))))))

(deftest permissions-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}    {}
                 :model/PermissionsGroup           {group-id-2 :id}    {}
                 :model/User                       {user-id-1 :id}     {}
                 :model/User                       {user-id-2 :id}     {:is_superuser true}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id-1
                                                                        :group_id group-id-1}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id-1
                                                                        :group_id group-id-2}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id-2
                                                                        :group_id group-id-1}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id-2
                                                                        :group_id group-id-2}
                 :model/Database                   {database-id-1 :id} {}
                 :model/Database                   {database-id-2 :id} {}
                 :model/Table                      {table-id-1 :id}    {:db_id database-id-1}
                 :model/Table                      {table-id-2 :id}    {:db_id database-id-1}]
    (mt/with-no-data-perms-for-all-users!
      ;; Clear the default permissions for the groups
      (t2/delete! :model/DataPermissions :group_id group-id-1)
      (t2/delete! :model/DataPermissions :group_id group-id-2)
      (testing "A single user's data permissions can be fetched as a graph"
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/data-access :unrestricted)
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/native-query-editing :yes)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/data-access :no-self-service)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/native-query-editing :no)
        (is (partial=
             {database-id-1
              {:perms/data-access :unrestricted
               :perms/native-query-editing :yes}
              database-id-2
              {:perms/data-access :block
               :perms/native-query-editing :no}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Perms from multiple groups are coalesced"
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/data-access :no-self-service)
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/native-query-editing :no)
        (data-perms/set-database-permission! group-id-2 database-id-2 :perms/data-access :unrestricted)
        (data-perms/set-database-permission! group-id-2 database-id-2 :perms/native-query-editing :yes)
        (is (partial=
             {database-id-1
              {:perms/data-access :unrestricted
               :perms/native-query-editing :yes}
              database-id-2
              {:perms/data-access :unrestricted
               :perms/native-query-editing :yes}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Table-level perms are included if they're more permissive than any database-level perms"
        (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :no-self-service)
        (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :unrestricted)
        (is (partial=
             {database-id-1
              {:perms/data-access {table-id-1 :block
                                   table-id-2 :unrestricted}}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Table-level perms are not included if a database-level perm is more permissive"
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/data-access :unrestricted)
        (is (partial=
             {database-id-1
              {:perms/data-access :unrestricted}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Admins always have full permissions"
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/data-access :no-self-service)
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/native-query-editing :no)
        (is (partial=
             {database-id-1
              {:perms/data-access :unrestricted
               :perms/native-query-editing :yes
               :perms/manage-database :yes
               :perms/manage-table-metadata :yes
               :perms/download-results :one-million-rows}}
             (data-perms/permissions-for-user user-id-2)))))))

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
    (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
      ;; Clear the default permissions for the groups
      (t2/delete! :model/DataPermissions :group_id group-id-1)
      (t2/delete! :model/DataPermissions :group_id group-id-2)
      (testing "Data access and native query permissions can be fetched as a graph"
        (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
        (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :no-self-service)
        (data-perms/set-table-permission! group-id-1 table-id-3 :perms/data-access :unrestricted)
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/native-query-editing :yes)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/native-query-editing :no)
        (data-perms/set-table-permission! group-id-2 table-id-1 :perms/data-access :no-self-service)
        (is (partial=
             {group-id-1
              {database-id-1 {:perms/data-access
                              {"PUBLIC"
                               {table-id-1 :unrestricted
                                table-id-2 :no-self-service}}
                              :perms/native-query-editing :yes}
               database-id-2 {:perms/data-access
                              {""
                               {table-id-3 :unrestricted}}
                              :perms/native-query-editing :no}}
              group-id-2
              {database-id-1 {:perms/data-access
                              {"PUBLIC"
                               {table-id-1 :no-self-service}}}}}
             (data-perms/data-permissions-graph))))

      (testing "Additional data permissions are included when set"
        (data-perms/set-table-permission! group-id-1 table-id-3 :perms/download-results :one-million-rows)
        (data-perms/set-table-permission! group-id-1 table-id-1 :perms/manage-table-metadata :yes)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/manage-database :yes)
        (is (partial=
             {group-id-1
              {database-id-1 {:perms/manage-table-metadata
                              {"PUBLIC"
                               {table-id-1 :yes}}}
               database-id-2 {:perms/download-results
                              {""
                               {table-id-3 :one-million-rows}}
                              :perms/manage-database :yes}}}
             (data-perms/data-permissions-graph))))

      (testing "Data permissions graph can be filtered by group ID, database ID, and permission type"
        (is (= {group-id-1
                {database-id-1 {:perms/data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :no-self-service}}
                                :perms/native-query-editing :yes
                                :perms/manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}
                 database-id-2 {:perms/data-access
                                {""
                                 {table-id-3 :unrestricted}}
                                :perms/download-results
                                {""
                                 {table-id-3 :one-million-rows}}
                                :perms/manage-database :yes
                                :perms/native-query-editing :no}}}
               (data-perms/data-permissions-graph :group-id group-id-1)))

        (is (= {group-id-1
                {database-id-1 {:perms/data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :no-self-service}}
                                :perms/native-query-editing :yes
                                :perms/manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}}}
               (data-perms/data-permissions-graph :group-id group-id-1
                                                  :db-id database-id-1)))

        (is (= {group-id-1
                {database-id-1 {:perms/data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :no-self-service}}}}}
               (data-perms/data-permissions-graph :group-id group-id-1
                                                  :db-id database-id-1
                                                  :perm-type :perms/data-access)))))))

(deftest most-restrictive-per-group-works
  (is (= #{:unrestricted}
         (#'data-perms/most-restrictive-per-group :perms/data-access [{:group-id 1 :value :unrestricted}])))
  (is (= #{:no-self-service}
         (#'data-perms/most-restrictive-per-group :perms/data-access [{:group-id 1 :value :unrestricted}
                                                                      {:group-id 1 :value :no-self-service}])))
  (is (= #{:no-self-service :unrestricted}
         (#'data-perms/most-restrictive-per-group :perms/data-access [{:group-id 1 :value :unrestricted}
                                                                      {:group-id 1 :value :no-self-service}
                                                                      {:group-id 2 :value :unrestricted}])))
  (is (= #{:block}
         (#'data-perms/most-restrictive-per-group :perms/data-access [{:group-id 1 :value :block}
                                                                      {:group-id 1 :value :no-self-service}
                                                                      {:group-id 1 :value :unrestricted}]))))

(deftest full-schema-permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}    {}
                 :model/User                       {user-id-1 :id}     {}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id-1
                                                                        :group_id group-id-1}
                 :model/Database                   {database-id-1 :id} {}
                 :model/Table                      {table-id-1 :id}    {:db_id database-id-1
                                                                        :schema "schema_1"}
                 :model/Table                      {table-id-2 :id}    {:db_id database-id-1
                                                                        :schema "schema_1"}]
    (let [all-users-group-id (:id (perms-group/all-users))]
      (mt/with-no-data-perms-for-all-users!
        ;; Clear the default permissions for the groups
        (t2/delete! :model/DataPermissions :group_id group-id-1)
        (testing "'Full' schema-level permission for a group is the lowest permission available for a table in the schema"
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :unrestricted)
          (is (= :unrestricted (data-perms/full-schema-permission-for-user
                                user-id-1 :perms/data-access database-id-1 "schema_1"))))
        (testing "Dropping permission for one table means we lose full schema permissions"
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :no-self-service)
          (is (= :no-self-service (data-perms/full-schema-permission-for-user
                                   user-id-1 :perms/data-access database-id-1 "schema_1"))))
        (testing "Permissions don't merge across groups"
          ;; even if a user has `unrestricted` access to all tables in a schema, that doesn't count as `unrestricted`
          ;; access to the schema unless it was granted to a *single group*.
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :unrestricted)
          (is (= :no-self-service (data-perms/full-schema-permission-for-user
                                   user-id-1 :perms/data-access database-id-1 "schema_1"))))))))

(deftest most-permissive-database-permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id}    {}
                 :model/User                       {user-id-1 :id}     {}
                 :model/PermissionsGroupMembership {}                  {:user_id  user-id-1
                                                                        :group_id group-id-1}
                 :model/Database                   {database-id-1 :id} {}
                 :model/Table                      {table-id-1 :id}    {:db_id database-id-1}
                 :model/Table                      {table-id-2 :id}    {:db_id database-id-1}]
    (let [all-users-group-id (:id (perms-group/all-users))]
      (mt/with-no-data-perms-for-all-users!
        ;; Clear the default permissions for the groups
        (t2/delete! :model/DataPermissions :group_id group-id-1)
        (testing "We get back the highest permission available for a table in the database"
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :unrestricted)
          (is (= :unrestricted (data-perms/most-permissive-database-permission-for-user
                                user-id-1 :perms/data-access database-id-1))))
        (testing "Dropping permission for one table has no effect"
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :no-self-service)
          (is (= :unrestricted (data-perms/most-permissive-database-permission-for-user
                                user-id-1 :perms/data-access database-id-1))))
        (testing "Blocks work like usual"
          ;; If I am blocked by one group, `:no-self-service` is overriden and I end up with `:block` permission.
          (data-perms/set-database-permission! all-users-group-id database-id-1 :perms/data-access :block)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/data-access :no-self-service)
          (is (= :block (data-perms/most-permissive-database-permission-for-user
                         user-id-1 :perms/data-access database-id-1))))))))

(deftest set-new-table-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}   {}
                 :model/Database         {db-id :id}      {}
                 :model/Table            {table-id-1 :id} {:db_id db-id :schema "PUBLIC"}
                 :model/Table            {table-id-2 :id} {:db_id db-id :schema "PUBLIC"}
                 :model/Table            {table-id-3 :id} {:db_id db-id :schema "other-schema"}]
    (let [perm-value (fn [table-id] (t2/select-one-fn :perm_value
                                                      :model/DataPermissions
                                                      :db_id     db-id
                                                      :group_id  group-id
                                                      :table_id  table-id
                                                      :perm_type :perms/data-access))]
      (mt/with-restored-data-perms-for-group! group-id
        (testing "New table inherits DB-level permission if set"
          (data-perms/set-table-permission! group-id table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id table-id-2 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id table-id-3 :perms/data-access :unrestricted)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :unrestricted (perm-value nil)))
            (is (nil? (perm-value table-id-4)))))

        (testing "New table inherits uniform permission value from schema"
          (data-perms/set-table-permission! group-id table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id table-id-2 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id table-id-3 :perms/data-access :no-self-service)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :unrestricted (perm-value table-id-4))))

          (data-perms/set-table-permission! group-id table-id-1 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id table-id-3 :perms/data-access :unrestricted)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :no-self-service (perm-value table-id-4)))))

        (testing "New table uses default value when schema permissions are not uniform"
          (data-perms/set-table-permission! group-id table-id-1 :perms/data-access :unrestricted)
          (data-perms/set-table-permission! group-id table-id-2 :perms/data-access :no-self-service)
          (data-perms/set-table-permission! group-id table-id-3 :perms/data-access :no-self-service)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :no-self-service (perm-value table-id-4)))))))))

(deftest additional-table-permissions-works
  (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                 :model/Database                   {db-id :id}    {}
                 :model/User                       {user-id :id}  {}
                 :model/PermissionsGroupMembership {}             {:user_id  user-id
                                                                   :group_id group-id}
                 :model/Table                      {table-id :id} {:db_id db-id
                                                                   :schema "PUBLIC"}]
    (mt/with-no-data-perms-for-all-users!
      (testing "we can override the existing permission, using normal coalesce logic"
        (mt/with-restored-data-perms-for-group! group-id
          (data-perms/set-database-permission! group-id db-id :perms/data-access :no-self-service)
          (data-perms/with-additional-table-permission :perms/data-access db-id table-id :unrestricted
            (is (= :unrestricted (data-perms/table-permission-for-user user-id :perms/data-access db-id table-id))))))
      (testing "normal coalesce logic applies, so e.g. `:block` will override `:no-self-service`"
        (mt/with-restored-data-perms-for-group! group-id
          (is (= :block (data-perms/table-permission-for-user user-id :perms/data-access db-id table-id)))
          (data-perms/with-additional-table-permission :perms/data-access db-id table-id :no-self-service
            (is (= :block (data-perms/table-permission-for-user user-id :perms/data-access db-id table-id))))))
      (testing "... but WILL NOT override `:unrestricted`"
        (mt/with-restored-data-perms-for-group! group-id
          (is (= :block (data-perms/table-permission-for-user user-id :perms/data-access db-id table-id)))
          (data-perms/with-additional-table-permission :perms/data-access db-id table-id :unrestricted
            (is (= :unrestricted (data-perms/table-permission-for-user user-id :perms/data-access db-id table-id)))))))))
