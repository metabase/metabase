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
      :unrestricted    [:perms/view-data   #{:unrestricted :legacy-no-self-service :blocked}]
      :blocked         [:perms/view-data #{:blocked}]
      nil              [:perms/view-data #{}])))

(deftest ^:parallel at-least-as-permissive?-test
  (testing "at-least-as-permissive? correctly compares permission values"
   (is (data-perms/at-least-as-permissive? :perms/view-data :unrestricted :unrestricted))
   (is (data-perms/at-least-as-permissive? :perms/view-data :unrestricted :legacy-no-self-service))
   (is (data-perms/at-least-as-permissive? :perms/view-data :unrestricted :blocked))
   (is (not (data-perms/at-least-as-permissive? :perms/view-data :legacy-no-self-service :unrestricted)))
   (is (data-perms/at-least-as-permissive? :perms/view-data :legacy-no-self-service :legacy-no-self-service))
   (is (data-perms/at-least-as-permissive? :perms/view-data :legacy-no-self-service :blocked))
   (is (not (data-perms/at-least-as-permissive? :perms/view-data :blocked :unrestricted)))
   (is (not (data-perms/at-least-as-permissive? :perms/view-data :blocked :legacy-no-self-service)))
   (is (data-perms/at-least-as-permissive? :perms/view-data :blocked :blocked))))

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
         (data-perms/set-database-permission! group-id database-id :perms/create-queries :no)
         (is (= :no (perm-value :perms/create-queries)))
         (data-perms/set-database-permission! group-id database-id :perms/create-queries :query-builder)
         (is (= :query-builder (perm-value :perms/create-queries))))

       (testing "`set-database-permission!` sets native query permissions to :no if data access is set to :blocked"
         (data-perms/set-database-permission! group-id database-id :perms/view-data :blocked)
         (is (= :blocked (perm-value :perms/view-data)))
         (is (= :no (perm-value :perms/create-queries))))

       (testing "A database-level permission cannot be set to an invalid value"
         (is (thrown-with-msg?
              ExceptionInfo
              #"Permission type :perms/create-queries cannot be set to :invalid-value"
              (data-perms/set-database-permission! group-id database-id :perms/create-queries :invalid-value))))))))

(deftest set-table-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}      {}
                 :model/Database         {database-id :id}   {}
                 :model/Database         {database-id-2 :id} {}
                 :model/Table            {table-id-1 :id
                                          :as table-1}       {:db_id database-id}
                 :model/Table            {table-id-2 :id}    {:db_id database-id}
                 :model/Table            {table-id-3 :id}    {:db_id database-id}
                 :model/Table            {table-id-4 :id}    {:db_id database-id-2}]
    (let [create-queries-perm-value (fn [table-id] (t2/select-one-fn :perm_value :model/DataPermissions
                                                                   :db_id     database-id
                                                                   :group_id  group-id
                                                                   :table_id  table-id
                                                                   :perm_type :perms/create-queries))]
      (mt/with-restored-data-perms-for-group! group-id
        (testing "`set-table-permissions!` can set individual table permissions to different values"
          (data-perms/set-table-permissions! group-id :perms/create-queries {table-id-1 :no
                                                                             table-id-2 :query-builder
                                                                             table-id-3 :no})
          (is (= :no            (create-queries-perm-value table-id-1)))
          (is (= :query-builder (create-queries-perm-value table-id-2)))
          (is (= :no            (create-queries-perm-value table-id-3))))

        (testing "`set-table-permissions!` can set individual table permissions passed in as the full tables"
          (data-perms/set-table-permissions! group-id :perms/create-queries {table-1 :query-builder})
          (is (= :query-builder (create-queries-perm-value table-id-1))))

        (testing "`set-table-permission!` coalesces table perms to a DB-level value if they're all the same"
          (data-perms/set-table-permissions! group-id :perms/create-queries {table-id-1 :no
                                                                             table-id-2 :no})
          (is (= :no (create-queries-perm-value nil)))
          (is (nil?  (create-queries-perm-value table-id-1)))
          (is (nil?  (create-queries-perm-value table-id-2)))
          (is (nil?  (create-queries-perm-value table-id-3))))

        (testing "`set-table-permission!` breaks table perms out again if any are modified"
          (data-perms/set-table-permissions! group-id :perms/create-queries {table-id-2 :query-builder
                                                                             table-id-3 :no})
          (is (nil?             (create-queries-perm-value nil)))
          (is (= :no            (create-queries-perm-value table-id-1)))
          (is (= :query-builder (create-queries-perm-value table-id-2)))
          (is (= :no            (create-queries-perm-value table-id-3))))

        (testing "A non table-level permission cannot be set"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Permission type :perms/manage-database cannot be set on tables."
               (data-perms/set-table-permissions! group-id :perms/manage-database {table-id-1 :yes}))))

        (testing "A table-level permission cannot be set to an invalid value"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Permission type :perms/create-queries cannot be set to :invalid"
               (data-perms/set-table-permissions! group-id :perms/create-queries {table-id-1 :invalid}))))

        (testing "A table-level permission cannot be set to :block"
          (is (thrown-with-msg?
               ExceptionInfo
               #"Block permissions must be set at the database-level only."
               (data-perms/set-table-permissions! group-id :perms/view-data {table-id-1 :blocked}))))

        (testing "Table-level permissions can only be set in bulk for tables in the same database"
          (is (thrown-with-msg?
               ExceptionInfo
               #"All tables must belong to the same database."
               (data-perms/set-table-permissions! group-id :perms/create-queries {table-id-3 :query-builder
                                                                                  table-id-4 :query-builder}))))

        (testing "Setting block permissions at the database level clears table-level query query perms"
          (data-perms/set-database-permission! group-id database-id :perms/view-data :blocked)
          (is (= :no (create-queries-perm-value nil)))
          (is (nil?  (create-queries-perm-value table-id-1)))
          (is (nil?  (create-queries-perm-value table-id-2)))
          (is (nil?  (create-queries-perm-value table-id-3))))))))

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
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/manage-database :yes)
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/manage-database :no)
        (is (= :yes (data-perms/database-permission-for-user user-id :perms/manage-database database-id-1))))

      (testing "`database-permission-for-user` falls back to the least permissive value if no value exists for the user"
        (t2/delete! :model/DataPermissions :db_id database-id-2)
        (is (= :no (data-perms/database-permission-for-user user-id :perms/manage-database database-id-2))))

      (testing "Admins always have the most permissive value, regardless of group membership"
        (is (= :yes (data-perms/database-permission-for-user (mt/user->id :crowberto) :perms/manage-database database-id-2)))))

    (testing "caching works as expected"
      (binding [api/*current-user-id* user-id]
        (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
          (data-perms/set-database-permission! group-id-1 database-id-1 :perms/manage-database :yes)
          (data-perms/with-relevant-permissions-for-user user-id
            ;; retrieve the cache now so it doesn't get counted in the call-count
            @data-perms/*permissions-for-user*
            ;; make the cache wrong
            (data-perms/set-database-permission! group-id-1 database-id-1 :perms/manage-database :no)
            ;; the cached value is used
            (t2/with-call-count [call-count]
              (is (= :yes (data-perms/database-permission-for-user user-id :perms/manage-database database-id-1)))
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
    ;; Revoke All Users perms so that it doesn't override perms in the new groups
    (mt/with-no-data-perms-for-all-users!
      (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
        (testing "`table-permission-for-user` coalesces permissions from all groups a user is in"
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id-2 table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! (perms-group/all-users) table-id-1 :perms/create-queries :no)
          (is (= :query-builder (data-perms/table-permission-for-user user-id :perms/create-queries database-id table-id-1))))

        (testing "`table-permission-for-user` falls back to the least permissive value if no value exists for the user"
          (t2/delete! :model/DataPermissions :db_id database-id)
          (is (= :no (data-perms/table-permission-for-user user-id :perms/create-queries database-id table-id-2))))

        (testing "Admins always have the most permissive value, regardless of group membership"
          (is (= :query-builder-and-native (data-perms/table-permission-for-user (mt/user->id :crowberto) :perms/create-queries database-id table-id-2))))

        (mt/with-restored-data-perms-for-groups! [group-id-1 group-id-2]
          (testing "caching works as expected"
            (binding [api/*current-user-id* user-id]
              (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :query-builder)
              (data-perms/set-table-permission! group-id-2 table-id-1 :perms/create-queries :query-builder)
              (is (= :query-builder (data-perms/table-permission-for-user user-id :perms/create-queries database-id table-id-1)))
              (data-perms/with-relevant-permissions-for-user user-id
                ;; retrieve the cache now so it doesn't get counted in the call count
                @data-perms/*permissions-for-user*
                ;; make the cache wrong
                (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :no)
                ;; the cached value is used
                (t2/with-call-count [call-count]
                  (is (= :query-builder (data-perms/table-permission-for-user user-id :perms/create-queries database-id table-id-1)))
                  (is (zero? (call-count))))))))))))

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
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/view-data :unrestricted)
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/create-queries :query-builder-and-native)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/view-data :blocked)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/create-queries :no)
        (is (partial=
             {database-id-1
              {:perms/view-data :unrestricted
               :perms/create-queries :query-builder-and-native}
              database-id-2
              {:perms/view-data :blocked
               :perms/create-queries :no}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Perms from multiple groups are coalesced"
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/view-data :unrestricted)
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/create-queries :no)
        (data-perms/set-database-permission! group-id-2 database-id-2 :perms/view-data :unrestricted)
        (data-perms/set-database-permission! group-id-2 database-id-2 :perms/create-queries :query-builder-and-native)
        (is (partial=
             {database-id-1
              {:perms/view-data :unrestricted
               :perms/create-queries :query-builder-and-native}
              database-id-2
              {:perms/view-data :unrestricted
               :perms/create-queries :query-builder-and-native}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Table-level perms are included if they're more permissive than any database-level perms"
        (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :no)
        (data-perms/set-table-permission! group-id-1 table-id-2 :perms/create-queries :query-builder)
        (is (partial=
             {database-id-1
              {:perms/create-queries {table-id-1 :no
                                      table-id-2 :query-builder}}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Table-level perms are not included if a database-level perm is more permissive"
        (data-perms/set-database-permission! group-id-2 database-id-1 :perms/create-queries :query-builder-and-native)
        (is (partial=
             {database-id-1
              {:perms/create-queries :query-builder-and-native}}
             (data-perms/permissions-for-user user-id-1))))

      (testing "Admins always have full permissions"
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/view-data :blocked)
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/create-queries :no)
        (is (partial=
             {database-id-1
              {:perms/view-data :unrestricted
               :perms/create-queries :query-builder-and-native
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
      (testing "Data and query permissions can be fetched as a graph"
        (data-perms/set-database-permission! group-id-1 database-id-1 :perms/create-queries :query-builder-and-native)
        (data-perms/set-database-permission! group-id-1 database-id-2 :perms/create-queries :no)
        (data-perms/set-table-permission! group-id-1 table-id-1 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! group-id-1 table-id-2 :perms/view-data :legacy-no-self-service)
        (data-perms/set-table-permission! group-id-1 table-id-3 :perms/view-data :unrestricted)
        (data-perms/set-table-permission! group-id-2 table-id-1 :perms/view-data :legacy-no-self-service)
        (is (partial=
             {group-id-1
              {database-id-1 {:perms/view-data
                              {"PUBLIC"
                               {table-id-1 :unrestricted
                                table-id-2 :legacy-no-self-service}}
                              :perms/create-queries :query-builder-and-native}
               database-id-2 {:perms/view-data
                              {""
                               {table-id-3 :unrestricted}}
                              :perms/create-queries :no}}
              group-id-2
              {database-id-1 {:perms/view-data
                              {"PUBLIC"
                               {table-id-1 :legacy-no-self-service}}}}}
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
                {database-id-1 {:perms/view-data
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :legacy-no-self-service}}
                                :perms/create-queries :query-builder-and-native
                                :perms/manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}
                 database-id-2 {:perms/view-data
                                {""
                                 {table-id-3 :unrestricted}}
                                :perms/download-results
                                {""
                                 {table-id-3 :one-million-rows}}
                                :perms/manage-database :yes
                                :perms/create-queries :no}}}
               (data-perms/data-permissions-graph :group-id group-id-1)))

        (is (= {group-id-1
                {database-id-1 {:perms/view-data
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :legacy-no-self-service}}
                                :perms/create-queries :query-builder-and-native
                                :perms/manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}}}
               (data-perms/data-permissions-graph :group-id group-id-1
                                                  :db-id database-id-1)))

        (is (= {group-id-1
                {database-id-1 {:perms/view-data
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :legacy-no-self-service}}}}}
               (data-perms/data-permissions-graph :group-id group-id-1
                                                  :db-id database-id-1
                                                  :perm-type :perms/view-data)))))))

(deftest most-restrictive-per-group-works
  (is (= #{:query-builder-and-native}
         (#'data-perms/most-restrictive-per-group :perms/create-queries [{:group-id 1 :value :query-builder-and-native}])))
  (is (= #{:no}
         (#'data-perms/most-restrictive-per-group :perms/create-queries [{:group-id 1 :value :query-builder}
                                                                         {:group-id 1 :value :no}])))
  (is (= #{:no :query-builder-and-native}
         (#'data-perms/most-restrictive-per-group :perms/create-queries [{:group-id 1 :value :query-builder-and-native}
                                                                         {:group-id 1 :value :no}
                                                                         {:group-id 2 :value :query-builder-and-native}])))
  (is (= #{:no}
         (#'data-perms/most-restrictive-per-group :perms/create-queries [{:group-id 1 :value :no}
                                                                         {:group-id 1 :value :query-builder}
                                                                         {:group-id 1 :value :query-builder-and-native}]))))

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
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/create-queries :query-builder)
          (is (= :query-builder (data-perms/full-schema-permission-for-user
                                 user-id-1 :perms/create-queries database-id-1 "schema_1"))))
        (testing "Dropping permission for one table means we lose full schema permissions"
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/create-queries :no)
          (is (= :no (data-perms/full-schema-permission-for-user
                      user-id-1 :perms/create-queries database-id-1 "schema_1"))))
        (testing "Permissions don't merge across groups"
          ;; even if a user has `unrestricted` access to all tables in a schema, that doesn't count as `unrestricted`
          ;; access to the schema unless it was granted to a *single group*.
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/create-queries :query-builder)
          (is (= :no (data-perms/full-schema-permission-for-user
                      user-id-1 :perms/create-queries database-id-1 "schema_1"))))))))

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
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/create-queries :query-builder)
          (is (= :query-builder (data-perms/most-permissive-database-permission-for-user
                                 user-id-1 :perms/create-queries database-id-1))))
        (testing "Dropping permission for one table has no effect"
          (data-perms/set-table-permission! all-users-group-id table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! all-users-group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id-1 table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id-1 table-id-2 :perms/create-queries :no)
          (is (= :query-builder (data-perms/most-permissive-database-permission-for-user
                                 user-id-1 :perms/create-queries database-id-1))))))))

(deftest set-new-database-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                 :model/Database         {db-id-1 :id}  {}
                 :model/Database         {db-id-2 :id}  {}]
    (mt/with-model-cleanup [:model/Database]
      ;; First delete the default permissions for the group so we start with a clean slate
      (t2/delete! :model/DataPermissions :group_id group-id)
      (testing "Data permissions... "
        (testing "A new database always gets `unrestricted` perms on OSS"
          ;; EE behavior is tested in `metabase-enterprise.advanced-permissions.common-test`
          (data-perms/set-database-permission! group-id db-id-1 :perms/view-data :unrestricted)
          ;; We don't use `with-temp` to create the new Database because it always grants permissions automatically
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :unrestricted (t2/select-one-fn :perm_value
                                                   :model/DataPermissions
                                                   :db_id     new-db-id
                                                   :group_id  group-id
                                                   :perm_type :perms/view-data)))
            (t2/delete! :model/Database :id new-db-id))

          (data-perms/set-database-permission! group-id db-id-1 :perms/view-data :legacy-no-self-service)
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :unrestricted (t2/select-one-fn :perm_value
                                                   :model/DataPermissions
                                                   :db_id     new-db-id
                                                   :group_id  group-id
                                                   :perm_type :perms/view-data)))
            (t2/delete! :model/Database :id new-db-id))

          (testing "A new database gets `unrestricted` data perms on OSS even if a group has `blocked` perms for a DB"
            (mt/with-premium-features #{}
              (data-perms/set-database-permission! group-id db-id-2 :perms/view-data :blocked)
              (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
                (is (= :unrestricted (t2/select-one-fn :perm_value
                                                       :model/DataPermissions
                                                       :db_id     new-db-id
                                                       :group_id  group-id
                                                       :perm_type :perms/view-data))))))))

      (t2/delete! :model/DataPermissions :group_id group-id)
      (testing "Query permissions... "
        (testing "A new database gets `query-builder-and-native` query permissions if a group only has `query-builder-and-native` for other databases"
          (data-perms/set-database-permission! group-id db-id-1 :perms/create-queries :query-builder-and-native)
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :query-builder-and-native (t2/select-one-fn :perm_value
                                                               :model/DataPermissions
                                                               :db_id     new-db-id
                                                               :group_id  group-id
                                                               :perm_type :perms/create-queries)))
            (t2/delete! :model/Database :id new-db-id)))

        (testing "A new database gets `query-builder` query permissions if a group has `query-builder` for any database"
          (data-perms/set-database-permission! group-id db-id-2 :perms/create-queries :query-builder)
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :query-builder (t2/select-one-fn :perm_value
                                                    :model/DataPermissions
                                                    :db_id     new-db-id
                                                    :group_id  group-id
                                                    :perm_type :perms/create-queries)))
            (t2/delete! :model/Database :id new-db-id)))

        (testing "A new database gets `no` query permissions if a group has `no` for any database"
          (data-perms/set-database-permission! group-id db-id-2 :perms/create-queries :no)
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :no (t2/select-one-fn :perm_value
                                         :model/DataPermissions
                                         :db_id     new-db-id
                                         :group_id  group-id
                                         :perm_type :perms/create-queries)))
            (t2/delete! :model/Database :id new-db-id))))

      (t2/delete! :model/DataPermissions :group_id group-id)
      (testing "Download permissions... "
        (testing "A new database gets `one-million-rows` download permissions if a group only has `one-million-rows` for other databases"
          (data-perms/set-database-permission! group-id db-id-1 :perms/download-results :one-million-rows)
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :one-million-rows (t2/select-one-fn :perm_value
                                                       :model/DataPermissions
                                                       :db_id     new-db-id
                                                       :group_id  group-id
                                                       :perm_type :perms/download-results)))
            (t2/delete! :model/Database :id new-db-id)))

       (testing "A new database gets `no` download permissions if a group has `no` for any database"
          (data-perms/set-database-permission! group-id db-id-2 :perms/download-results :no)
          (let [new-db-id (t2/insert-returning-pk! :model/Database {:name "Test" :engine "h2" :details "{}"})]
            (is (= :no (t2/select-one-fn :perm_value
                                         :model/DataPermissions
                                         :db_id     new-db-id
                                         :group_id  group-id
                                         :perm_type :perms/download-results)))
            (t2/delete! :model/Database :id new-db-id)))))))

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
                                                      :perm_type :perms/create-queries))]
      (mt/with-restored-data-perms-for-group! group-id
        (testing "New table inherits DB-level permission if set"
          (data-perms/set-table-permission! group-id table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id table-id-2 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id table-id-3 :perms/create-queries :query-builder)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :query-builder (perm-value nil)))
            (is (nil? (perm-value table-id-4)))))

        (testing "New table inherits uniform permission value from schema"
          (data-perms/set-table-permission! group-id table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id table-id-2 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id table-id-3 :perms/create-queries :no)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :query-builder (perm-value table-id-4))))

          (data-perms/set-table-permission! group-id table-id-1 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id table-id-3 :perms/create-queries :query-builder)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :no (perm-value table-id-4)))))

        (testing "New table uses default value when schema permissions are not uniform"
          (data-perms/set-table-permission! group-id table-id-1 :perms/create-queries :query-builder)
          (data-perms/set-table-permission! group-id table-id-2 :perms/create-queries :no)
          (data-perms/set-table-permission! group-id table-id-3 :perms/create-queries :no)
          (mt/with-temp [:model/Table {table-id-4 :id} {:db_id db-id :schema "PUBLIC"}]
            (is (= :no (perm-value table-id-4)))))))))

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
          (data-perms/set-database-permission! group-id db-id :perms/view-data :legacy-no-self-service)
          (data-perms/with-additional-table-permission :perms/view-data db-id table-id :unrestricted
            (is (= :unrestricted (data-perms/table-permission-for-user user-id :perms/view-data db-id table-id))))))
      ;; `legacy-no-self-service` is deprecated and is only different from `unrestricted` in its coalescing behavior
      (testing "normal coalesce logic applies, so e.g. `:blocked` will override `:legacy-no-self-service`"
        (mt/with-restored-data-perms-for-group! group-id
          (data-perms/set-database-permission! group-id db-id :perms/view-data :blocked)
          (is (= :blocked (data-perms/table-permission-for-user user-id :perms/view-data db-id table-id)))
          (data-perms/with-additional-table-permission :perms/view-data db-id table-id :legacy-no-self-service
            (is (= :blocked (data-perms/table-permission-for-user user-id :perms/view-data db-id table-id))))))
      (testing "... but WILL NOT override `:unrestricted`"
        (mt/with-restored-data-perms-for-group! group-id
          (data-perms/set-database-permission! group-id db-id :perms/view-data :blocked)
          (is (= :blocked (data-perms/table-permission-for-user user-id :perms/view-data db-id table-id)))
          (data-perms/with-additional-table-permission :perms/view-data db-id table-id :unrestricted
            (is (= :unrestricted (data-perms/table-permission-for-user user-id :perms/view-data db-id table-id)))))))))
