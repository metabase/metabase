(ns metabase-enterprise.advanced-permissions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.db :as advanced-permissions.db]
   [metabase.permissions.db :as permissions.db]
   [metabase.test :as mt]))

(deftest partitioned-group-reads-test
  (mt/with-temp [:model/PermissionsGroup {group-a :id} {}
                 :model/PermissionsGroup {group-b :id} {}
                 :model/PermissionsGroup {group-c :id} {}
                 :model/PermissionsGroup {group-d :id} {}
                 :model/PermissionsGroup {group-e :id} {}]
    (permissions.db/insert-data-permissions!
     (for [group-id [group-a group-c group-e]]
       {:group_id group-id :db_id (mt/id) :perm_type :perms/view-data :perm_value :blocked}))
    (let [group-ids [group-a group-b group-c group-d group-e]
          reads     (fn []
                      {:blocked              (advanced-permissions.db/blocked-group-ids group-ids)
                       :blocked-in-database  (advanced-permissions.db/blocked-group-ids-for-database (mt/id) group-ids)
                       :sandboxed            (advanced-permissions.db/sandboxed-group-ids group-ids)})
          single    (reads)]
      (testing "a set of the groups found, and nil when none is, as with one statement"
        (is (= {:blocked             #{group-a group-c group-e}
                :blocked-in-database #{group-a group-c group-e}
                :sandboxed           nil}
               single))
        (is (= single (mt/with-partition-size 2 (reads))))))))
