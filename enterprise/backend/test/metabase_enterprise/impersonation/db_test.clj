(ns metabase-enterprise.impersonation.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.db :as impersonation.db]
   [metabase.permissions.db :as permissions.db]
   [metabase.test :as mt]))

(deftest view-data-permission-values-partitions-test
  (mt/with-temp [:model/PermissionsGroup {group-a :id} {}
                 :model/PermissionsGroup {group-b :id} {}
                 :model/PermissionsGroup {group-c :id} {}]
    (permissions.db/insert-data-permissions!
     [{:group_id group-a :db_id (mt/id) :perm_type :perms/view-data :perm_value :blocked}
      {:group_id group-c :db_id (mt/id) :perm_type :perms/view-data :perm_value :unrestricted}])
    (let [values #(impersonation.db/view-data-permission-values (mt/id) #{group-a group-b group-c})
          single (values)]
      (is (= #{"blocked" "unrestricted"} (set (map name single))))
      (is (= single (mt/with-partition-size 2 (values)))))))
