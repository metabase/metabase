(ns metabase.permissions.models.data-permissions.sql-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions.sql :as sql]
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
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id nil
                                             :group_id (:id group)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}]
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
            permission-mapping {:perms/view-data [:blocked :most]
                                :perms/create-queries [:no :most]}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "User with multiple permissions should get results")
        (is (some #(= (:id %) (:id table1)) results) "Should include both permissions")
        (is (every? #(contains? #{"perms/view-data" "perms/create-queries"}  (:perm_type %)) results) "Should include the requested permission types")
        (is (every? #(contains? #{(:id group) (u/the-id (perms/all-users-group))}  (:group_id %)) results) "Should include user's group")))))

(deftest permission-level-with-most-least-directive-test
  (testing "permission level with most/least directive"
    (mt/with-temp [:model/Database db {}
                   :model/Table table1 {:db_id (:id db)}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id (:id table1)
                                             :group_id (:id group)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}]
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data [:unrestricted :most]}
            query (sql/select-tables-and-groups-granting-perm user-info permission-mapping)
            results (t2/query query)]
        (is (seq results) "User with most/least directive should get results")
        (is (some #(= (:id %) (:id table1)) results) "Should include table with permissions")))))

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

(deftest visible-table-filter-with-cte-include-inactive-test
  (testing "visible-table-filter-with-cte respects active-only? option"
    (mt/with-temp [:model/Database db {}
                   :model/Table active-table {:db_id (:id db) :active true}
                   :model/Table inactive-table {:db_id (:id db) :active false}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id nil
                                             :group_id (:id group)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id nil
                                             :group_id (:id group)
                                             :perm_type :perms/create-queries
                                             :perm_value :query-builder}]
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data :unrestricted
                                :perms/create-queries :query-builder}]
        (testing "default (active-only? false) includes inactive tables"
          (let [{:keys [with clause]} (sql/visible-table-filter-with-cte :id user-info permission-mapping)
                results (t2/query {:with with :select [:id] :from [[:metabase_table]] :where clause})]
            (is (some #(= (:id %) (:id active-table)) results))
            (is (some #(= (:id %) (:id inactive-table)) results))))
        (testing "active-only? true excludes inactive tables"
          (let [{:keys [with clause]} (sql/visible-table-filter-with-cte :id user-info permission-mapping
                                                                         {:active-only? true})
                results (t2/query {:with with :select [:id] :from [[:metabase_table]] :where clause})]
            (is (some #(= (:id %) (:id active-table)) results))
            (is (not (some #(= (:id %) (:id inactive-table)) results)))))))))

(deftest visible-table-filter-select-include-inactive-test
  (testing "visible-table-filter-select respects active-only? option"
    (mt/with-temp [:model/Database db {}
                   :model/Table active-table {:db_id (:id db) :active true}
                   :model/Table inactive-table {:db_id (:id db) :active false}
                   :model/PermissionsGroup group {}
                   :model/User user {}
                   :model/PermissionsGroupMembership _ {:user_id (:id user) :group_id (:id group)}
                   :model/DataPermissions _ {:db_id (:id db)
                                             :table_id nil
                                             :group_id (:id group)
                                             :perm_type :perms/view-data
                                             :perm_value :unrestricted}]
      (let [user-info {:user-id (:id user) :is-superuser? false}
            permission-mapping {:perms/view-data :unrestricted}]
        (testing "default includes inactive tables"
          (let [results (t2/query (sql/visible-table-filter-select :id user-info permission-mapping))]
            (is (some #(= (:id %) (:id active-table)) results))
            (is (some #(= (:id %) (:id inactive-table)) results))))
        (testing "active-only? true excludes inactive tables"
          (let [results (t2/query (sql/visible-table-filter-select :id user-info permission-mapping
                                                                   {:active-only? true}))]
            (is (some #(= (:id %) (:id active-table)) results))
            (is (not (some #(= (:id %) (:id inactive-table)) results)))))))))
