(ns metabase.permissions-rest.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions-rest.db :as permissions-rest.db]
   [metabase.permissions.db :as permissions.db]
   [metabase.test :as mt]))

(deftest data-permissions-reducible-partitions-test
  (mt/with-temp [:model/PermissionsGroup {group-a :id} {}
                 :model/PermissionsGroup {group-b :id} {}
                 :model/PermissionsGroup {group-c :id} {}]
    (permissions.db/insert-data-permissions!
     (for [group-id [group-a group-b group-c]
           table-id [(mt/id :venues) (mt/id :users)]]
       {:group_id group-id :db_id (mt/id) :perm_type :perms/create-queries :perm_value :query-builder
        :table_id table-id :schema_name "PUBLIC"}))
    (let [rows        (fn []
                        (into []
                              (map #(select-keys % [:group-id :db-id :table-id :value]))
                              (permissions-rest.db/data-permissions-reducible
                               {:perm-type :perms/create-queries :group-ids [group-c group-a group-b]})))
          single      (rows)
          partitioned (mt/with-partition-size 2 (rows))]
      (testing "the rows of every group are read, ordered by group, with one statement or several"
        (is (= 6 (count single)))
        (is (= (sort (map :group-id single)) (map :group-id partitioned)))
        (is (= (frequencies single) (frequencies partitioned)))))))
