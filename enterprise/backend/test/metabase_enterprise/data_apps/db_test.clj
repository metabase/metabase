(ns metabase-enterprise.data-apps.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest warning-queries-with-empty-ids-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (doseq [[group-ids database-ids table-ids] [[[] [1] [1]] [[(:id group)] [] [1]] [[(:id group)] [1] []]]]
      (testing (str "empty warning IDs " [group-ids database-ids table-ids])
        (t2/with-call-count [calls]
          (is (= [] (data-apps.db/permissions-for-warnings group-ids database-ids table-ids)))
          (is (zero? (calls))))))))

(deftest ^:synchronized warning-permissions-over-partitions-test
  (let [group-ids [(:id (perms/all-users-group))]
        table-ids [(mt/id :venues) (mt/id :checkins) (mt/id :users) (mt/id :categories) (mt/id :orders)]
        rows      #(frequencies (map (juxt :group_id :db_id :perm_type :table_id :perm_value) %))]
    (testing "the database-wide rows once, from partitions of the tables"
      (is (= (rows (data-apps.db/permissions-for-warnings group-ids [(mt/id)] table-ids))
             (rows (mt/with-partition-size 2
                     (data-apps.db/permissions-for-warnings group-ids [(mt/id)] table-ids))))))))
