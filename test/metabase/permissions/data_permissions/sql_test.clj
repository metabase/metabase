(ns metabase.permissions.data-permissions.sql-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions.sql :as sql]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest superuser-returns-all-tables-test
  (testing "superuser returns all tables regardless of permissions"
    (mt/with-temp [:model/Database db {}
                   :model/Table _ {:db_id (:id db)}
                   :model/Table _ {:db_id (:id db)}
                   :model/PermissionsGroup _ {}
                   :model/User user {}]
      (let [user-info {:user-id (:id user) :is-superuser? true}
            permission-mapping {:perms/view-data :unrestricted}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "Superuser should get results")
        (is (every? #(contains? % :id) results) "Results should contain table IDs")
        (is (every? #(contains? % :group_id) results) "Results should contain group IDs")))))

(deftest non-superuser-with-table-level-permissions-test
  (testing "non-superuser with table-level permissions"
    (mt/with-temp [:model/Database db {}
                   :model/Table table1 {:db_id (:id db)}
                   :model/Table _ {:db_id (:id db)}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id (:id table1)
                                             :group_id (:id group)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}]
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data :unrestricted}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "User with permissions should get results")
        (is (some #(= (:id %) (:id table1)) results) "Should include table with permissions")
        (is (every? #(contains? #{(:id group) (u/the-id (perms/all-users-group))}  (:group_id %)) results) "Should include user's group")))))

(deftest non-superuser-with-database-level-permissions-test
  (testing "non-superuser with database-level permissions"
    (mt/with-temp [:model/Database db {}
                   :model/Table table1 {:db_id (:id db)}
                   :model/Table table2 {:db_id (:id db)}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}]
      ;; set (rather than insert) the db-level perm: the group's default rows already cover this DB,
      ;; and data_permissions has a unique constraint per scope
      (perms/set-database-permission! (:id group) (:id db) :perms/view-data :unrestricted)
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data :unrestricted}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "User with database-level permissions should get results")
        (is (some #(= (:id %) (:id table1)) results) "Should include table1 from database permission")
        (is (some #(= (:id %) (:id table2)) results) "Should include table2 from database permission")
        (is (every? #(contains? #{(:id group) (u/the-id (perms/all-users-group))}  (:group_id %)) results) "Should include user's group")))))

(deftest multiple-permission-types-in-mapping-test
  (testing "multiple permission types in mapping"
    (mt/with-temp [:model/Database db {}
                   :model/Table table1 {:db_id (:id db)}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}]
      (perms/set-table-permission! group table1 :perms/view-data :blocked)
      (perms/set-table-permission! group table1 :perms/create-queries :no)
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data      :blocked
                                :perms/create-queries :no}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "User with multiple permissions should get results")
        (is (some #(= (:id %) (:id table1)) results) "Should include both permissions")
        (is (every? #(contains? #{"perms/view-data" "perms/create-queries"}  (:perm_type %)) results) "Should include the requested permission types")
        (is (every? #(contains? #{(:id group) (u/the-id (perms/all-users-group))}  (:group_id %)) results) "Should include user's group")))))

(deftest user-with-no-group-membership-test
  (testing "user with no group membership"
    (mt/with-restored-data-perms!
      (mt/with-temp [:model/Database db {}
                     :model/Table _ {:db_id (:id db)}
                     :model/PermissionsGroup _ {}
                     :model/User user {}]
        ;; need to remove permissions belong to the all users group since a user is always part
        ;; of that group
        (t2/delete! :model/DataPermissions :group_id (u/the-id (perms/all-users-group)))
        (let [user-info {:user-id (:id user) :is-superuser? false}
              permission-mapping {:perms/view-data :unrestricted}
              query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
              results (t2/query query)]
          (is (empty? results) "User with no group membership should get no results"))))))

(deftest user-with-no-matching-permissions-test
  (testing "user with no matching permissions"
    (mt/with-restored-data-perms!
      (mt/with-temp [:model/Database db {}
                     :model/Table table1 {:db_id (:id db)}
                     :model/PermissionsGroup group {}
                     :model/User user {}
                     :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}]
        (t2/delete! :model/DataPermissions :group_id (u/the-id (perms/all-users-group)))
        (perms/set-table-permission! group table1 :perms/view-data :blocked)
        (let [user-info {:user-id (:id user) :is-superuser? false}
              permission-mapping {:perms/view-data :unrestricted}
              query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
              results (t2/query query)]
          (is (not (some #(= (:id table1) (:id %)) results)) "User with non-matching permissions should get no results"))))))

(deftest empty-permission-mapping-test
  (testing "empty permission mapping"
    (mt/with-temp [:model/Database db {}
                   :model/Table _ {:db_id (:id db)}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}]
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (empty? results) "Empty permission mapping should not return results")))))

(deftest multiple-groups-with-different-permissions-test
  (testing "multiple groups with different permissions"
    (mt/with-temp [:model/Database db {}
                   :model/Table table1 {:db_id (:id db)}
                   :model/Table table2 {:db_id (:id db)}
                   :model/PermissionsGroup group1 {}
                   :model/PermissionsGroup group2 {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group1)}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group2)}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id (:id table1)
                                             :group_id (:id group1)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id (:id table2)
                                             :group_id (:id group2)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}]
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data :unrestricted}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "User in multiple groups should get results")
        (is (some #(and (= (:id %) (:id table1)) (= (:group_id %) (:id group1))) results)
            "Should include table1 from group1")
        (is (some #(and (= (:id %) (:id table2)) (= (:group_id %) (:id group2))) results)
            "Should include table2 from group2")))))

(deftest visible-tables-filter-clause-test
  (testing "Database-level rows count for every table, table-level rows for active tables only"
    (mt/with-temp [:model/Database db {}
                   :model/Database other-db {}
                   :model/Table granted-table {:db_id (:id db) :active true}
                   :model/Table inactive-table {:db_id (:id db) :active false}
                   :model/Table ungranted-table {:db_id (:id db) :active true}
                   :model/Table other-db-table {:db_id (:id other-db) :active false}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}]
      ;; drop the default grants every group, All Users included, gets on a new database: only `group` grants anything
      (t2/delete! :model/DataPermissions :db_id [:in [(:id db) (:id other-db)]])
      (perms/set-database-permission! (:id group) (:id db) :perms/view-data :unrestricted)
      (perms/set-database-permission! (:id group) (:id db) :perms/create-queries :no)
      (perms/set-table-permission! (:id group) granted-table :perms/create-queries :query-builder)
      (perms/set-table-permission! (:id group) inactive-table :perms/create-queries :query-builder)
      (perms/set-database-permission! (:id group) (:id other-db) :perms/view-data :unrestricted)
      (perms/set-database-permission! (:id group) (:id other-db) :perms/create-queries :query-builder)
      (let [user-info          {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data      :unrestricted
                                :perms/create-queries :query-builder}
            visible            (fn [query]
                                 (t2/select-pks-set :model/Table
                                                    (update query :where (fn [w] [:and [:in :db_id [(:id db) (:id other-db)]] w]))))]
        (testing "an inactive table's own grant doesn't count, a Database-level grant does"
          (is (= #{(:id granted-table) (:id other-db-table)}
                 (visible {:where (sql/visible-tables-filter-clause :id user-info permission-mapping)}))))
        (testing "from inside a derived table"
          (is (= #{(:id granted-table)}
                 (t2/select-pks-set :model/Table
                                    {:select [:x.id]
                                     :from   [[^:allow-subquery
                                               {:select [:id]
                                                :from   [:metabase_table]
                                                :where  [:and
                                                         [:= :db_id (:id db)]
                                                         (sql/visible-tables-filter-clause
                                                          :id user-info permission-mapping)]}
                                               :x]]}))))
        (testing "a superuser gets a clause that keeps every table"
          (is (= #{(:id granted-table) (:id inactive-table) (:id ungranted-table) (:id other-db-table)}
                 (visible {:where (sql/visible-tables-filter-clause
                                   :id (assoc user-info :is-superuser? true) permission-mapping)}))))))))

(deftest visible-databases-filter-clause-test
  (testing "a Database is visible through its own row or through an active table's row"
    (mt/with-temp [:model/Database db-grant {}
                   :model/Database table-grant {}
                   :model/Database inactive-grant {}
                   :model/Database none {}
                   :model/Table _ {:db_id (:id table-grant) :active true}
                   :model/Table inactive {:db_id (:id inactive-grant) :active false}
                   :model/Table active {:db_id (:id table-grant) :active true}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}]
      (let [db-ids [(:id db-grant) (:id table-grant) (:id inactive-grant) (:id none)]]
        (t2/delete! :model/DataPermissions :db_id [:in db-ids])
        (doseq [db-id db-ids]
          (perms/set-database-permission! (:id group) db-id :perms/view-data :unrestricted)
          (perms/set-database-permission! (:id group) db-id :perms/create-queries :no))
        (perms/set-database-permission! (:id group) (:id db-grant) :perms/create-queries :query-builder)
        (perms/set-table-permission! (:id group) active :perms/create-queries :query-builder)
        (perms/set-table-permission! (:id group) inactive :perms/create-queries :query-builder)
        (is (= #{(:id db-grant) (:id table-grant)}
               (t2/select-pks-set :model/Database
                                  {:where [:and [:in :id db-ids]
                                           (sql/visible-databases-filter-clause
                                            :id {:user-id (:id user) :is-superuser? false}
                                            {:perms/create-queries :query-builder})]})))))))
