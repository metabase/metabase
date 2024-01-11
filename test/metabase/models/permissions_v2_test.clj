(ns metabase.models.permissions-v2-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.permissions-v2 :as perms-v2]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(defn do-with-restored-perms!
  "Implementation of `with-restored-perms` and related helper functions. Optionally takes `group-ids` to restore only the
  permissions for a set of groups."
  [group-ids thunk]
  (let [select-condition [(when group-ids [:in :group_id group-ids])]
        original-perms (t2/select :model/PermissionsV2 {:where select-condition})]
    (try
      (thunk)
      (finally
        (t2/delete! :model/PermissionsV2 {:where select-condition})
        (t2/insert! :model/PermissionsV2 original-perms)))))

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
    (are [expected args] (= expected (apply perms-v2/coalesce args))
      :unrestricted    [:data-access #{:unrestricted :restricted :none}]
      :no-self-service [:data-access #{:no-self-service :none}]
      :block           [:data-access #{:block}]
      nil              [:data-access #{}]

      :curate          [:collection #{:curate :view :no-access}]
      :view            [:collection #{:view :no-access}]
      :no-access       [:collection #{:no-access}]
      nil              [:collection #{}]

      :yes             [:settings-access  #{:yes :no}]
      :no              [:settings-access  #{:no}]
      nil              [:settings-access  #{}]

      ;; We can also pass in a list
      :view            [:collection [:view :view :no-access :view :no-access]])))

(deftest set-permission!-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}      {}
                 :model/Collection       {collection-id :id} {}
                 :model/Database         {database-id :id}    {}
                 :model/Table            {table-id :id}      {}]
    (with-restored-perms-for-group! group-id
      (testing "`set-permission!` can set a new permission"
        (is (= 1 (perms-v2/set-permission! :collection group-id :curate collection-id)))
        (is (= :curate (t2/select-one-fn :perm_value
                                         :model/PermissionsV2
                                         :group_id  group-id
                                         :type      :collection
                                         :object_id collection-id))))

      (testing "`set-permission!` can update an existing permission"
        (is (= 1 (perms-v2/set-permission! :collection group-id :view collection-id)))
        (is (= 1 (t2/count :model/PermissionsV2
                           :type     :collection
                           :group_id group-id)))
        (is (= :view (t2/select-one-fn :perm_value
                                       :model/PermissionsV2
                                       :type      :collection
                                       :group_id  group-id
                                       :object_id collection-id))))

      (testing "`set-permission!` can set a new database-level permission"
        (is (= 1 (perms-v2/set-permission! :manage-database group-id :yes database-id)))
        (is (= :yes (t2/select-one-fn :perm_value
                                      :model/PermissionsV2
                                      :group_id  group-id
                                      :type      :manage-database
                                      :db_id     database-id))))

      (testing "`set-permission!` can update a new database-level permission"
        (is (= 1 (perms-v2/set-permission! :manage-database group-id :no database-id)))
        (is (= 1 (t2/count :model/PermissionsV2
                           :type     :manage-database
                           :group_id group-id)))
        (is (= :no (t2/select-one-fn :perm_value
                                     :model/PermissionsV2
                                     :group_id  group-id
                                     :type      :manage-database
                                     :db_id     database-id))))

      (testing "`set-permission!` can set a new table-level permission"
        (is (= 1 (perms-v2/set-permission! :data-access group-id :unrestricted table-id database-id "PUBLIC")))
        (is (= :unrestricted (t2/select-one-fn :perm_value
                                               :model/PermissionsV2
                                               :group_id  group-id
                                               :type      :data-access
                                               :table_id  table-id))))

      (testing "`set-permission!` can update a new table-level permission"
        (is (= 1 (perms-v2/set-permission! :data-access group-id :no-self-service table-id database-id "PUBLIC")))
        (is (= 1 (t2/count :model/PermissionsV2
                           :type     :data-access
                           :group_id group-id)))
        (is (= :no-self-service (t2/select-one-fn :perm_value
                                                  :model/PermissionsV2
                                                  :group_id  group-id
                                                  :type      :data-access
                                                  :table_id  table-id))))

      (testing "A permission associated with a model cannot be saved without an object_id"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :collection requires an object ID"
             (perms-v2/set-permission! :collection group-id :curate nil))))

      (testing "A table-level permission cannot be saved without a DB ID"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :data-access requires a database ID"
             (perms-v2/set-permission! :data-access group-id :unrestricted table-id))))

      (testing "An invalid permission type cannot be saved"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Invalid permission type, received: :invalid-type"
             (perms-v2/set-permission! :invalid-type group-id :unrestricted nil))))

      (testing "A permission value which is not valid for the provided type cannot be saved"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :collection cannot be set to :invalid-value"
             (perms-v2/set-permission! :collection group-id :invalid-value collection-id)))))))

(deftest permission-for-user-test
  (mt/with-temp [:model/PermissionsGroup           {group-id-1 :id} {}
                 :model/PermissionsGroup           {group-id-2 :id} {}
                 :model/User                       {user-id :id}    {}
                 :model/PermissionsGroupMembership {}               {:user_id  user-id
                                                                     :group_id group-id-1}
                 :model/PermissionsGroupMembership {}               {:user_id  user-id
                                                                     :group_id group-id-2}]
    (with-restored-perms-for-groups! [group-id-1 group-id-2]
      (testing "`permission-for-user` coalesces permissions from all groups a user is in"
        (perms-v2/set-permission! :native-query-editing group-id-1 :no 1)
        (is (= :no (perms-v2/permission-for-user user-id :native-query-editing 1)))

        (perms-v2/set-permission! :native-query-editing group-id-2 :yes 1)
        (is (= :yes (perms-v2/permission-for-user user-id :native-query-editing 1))))

      (testing "`permission-for-user` falls back to the least permissive value if no value exists for the user"
        (is (= :no (perms-v2/permission-for-user user-id :native-query-editing 2))))

      (testing "`permission-for-user` throws an exception if an object ID is required but not provided"
        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :native-query-editing requires a database ID"
             (perms-v2/permission-for-user user-id :native-query-editing)))

        (is (thrown-with-msg?
             ExceptionInfo
             #"Permission type :collection requires an object ID"
             (perms-v2/permission-for-user user-id :collection)))))))

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
      (testing "Data access and native query permissions can be fetched as a graph"
        (perms-v2/set-permission! :data-access group-id-1 :unrestricted table-id-1 database-id-1 "PUBLIC")
        (perms-v2/set-permission! :data-access group-id-1 :unrestricted table-id-2 database-id-1 "PUBLIC")
        (perms-v2/set-permission! :data-access group-id-1 :unrestricted table-id-3 database-id-2 nil)
        (perms-v2/set-permission! :native-query-editing group-id-1 :yes database-id-1)
        (perms-v2/set-permission! :native-query-editing group-id-1 :no database-id-2)
        (perms-v2/set-permission! :data-access group-id-2 :no-self-service table-id-1 database-id-1 "PUBLIC")
        (is (partial=
             {group-id-1
              {database-id-1 {:data-access
                              {"PUBLIC"
                               {table-id-1 :unrestricted
                                table-id-2 :unrestricted}}
                              :native-query-editing :yes}
               database-id-2 {:data-access
                              {""
                               {table-id-3 :unrestricted}}
                              :native-query-editing :no}}
              group-id-2
              {database-id-1 {:data-access
                              {"PUBLIC"
                               {table-id-1 :no-self-service}}}}}
             (perms-v2/data-permissions-graph))))

      (testing "Additional data permissions are included when set"
        (perms-v2/set-permission! :download-results group-id-1 :one-million-rows table-id-3 database-id-2 nil)
        (perms-v2/set-permission! :manage-table-metadata group-id-1 :yes table-id-1 database-id-1 "PUBLIC")
        (perms-v2/set-permission! :manage-database group-id-1 :yes database-id-2)
        (is (partial=
             {group-id-1
              {database-id-1 {:manage-table-metadata
                              {"PUBLIC"
                               {table-id-1 :yes}}}
               database-id-2 {:download-results
                              {""
                               {table-id-3 :one-million-rows}}
                              :manage-database :yes}}}
             (perms-v2/data-permissions-graph))))

      (testing "Data permissions graph can be filtered by group ID, databse ID, and permission type"
        (is (= {group-id-1
                {database-id-1 {:data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :unrestricted}}
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
               (perms-v2/data-permissions-graph :group-id group-id-1)))

        (is (= {group-id-1
                {database-id-1 {:data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :unrestricted}}
                                :native-query-editing :yes
                                :manage-table-metadata
                                {"PUBLIC"
                                 {table-id-1 :yes}}}}}
               (perms-v2/data-permissions-graph :group-id group-id-1
                                                :db-id database-id-1)))

        (is (= {group-id-1
                {database-id-1 {:data-access
                                {"PUBLIC"
                                 {table-id-1 :unrestricted
                                  table-id-2 :unrestricted}}}}}
               (perms-v2/data-permissions-graph :group-id group-id-1
                                                :db-id database-id-1
                                                :perm-type :data-access)))))))
