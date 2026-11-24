(ns metabase-enterprise.erd.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.erd.db :as erd.db]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                mdb/select-partition-size       2
                mdb/delete-partition-size       2
                mdb/update-partition-size       2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids #{(mt/id :venues) (mt/id :checkins) (mt/id :users) (mt/id :categories) (mt/id :orders)}
        by-table  #(update-vals (group-by :table_id %) (partial mapv :id))]
    (testing "tables from partitions"
      (is (= table-ids
             (set (map :id (erd.db/active-tables-in-database [:id] (mt/id) {:table-ids table-ids})))
             (set (map :id (partitioned! #(erd.db/active-tables-in-database [:id] (mt/id) {:table-ids table-ids})))))))
    (testing "each table's fields in field order over partitions"
      (is (= (by-table (erd.db/active-fields-for-tables table-ids))
             (by-table (partitioned! #(erd.db/active-fields-for-tables table-ids))))))))
