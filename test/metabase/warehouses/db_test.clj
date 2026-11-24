(ns metabase.warehouses.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]
   [metabase.warehouses.db :as warehouses.db]))

(defn- in-small-partitions!
  "What `f` returns when reads take at most two ids per statement."
  [f]
  (with-redefs [mdb.query/select-partition-size 2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Database {db-1 :id} {}
                 :model/Database {db-2 :id} {:router_database_id db-1}
                 :model/Database {db-3 :id} {}
                 :model/Table    _          {:db_id db-1, :display_name "b"}
                 :model/Table    _          {:db_id db-1, :display_name "a"}
                 :model/Table    _          {:db_id db-3, :display_name "c"}]
    (let [db-ids [db-3 (mt/id) db-1 db-2]]
      (testing "rows ordered by Database first keep their order"
        (let [f #(mapv :id (warehouses.db/active-tables-for-databases db-ids))]
          (is (= (f) (in-small-partitions! f)))))
      (testing "maps hold every row"
        (doseq [f [#(warehouses.db/router-database-ids db-ids)
                   #(update-vals (warehouses.db/databases-by-ids db-ids) :name)]]
          (is (= (f) (in-small-partitions! f))))))))
