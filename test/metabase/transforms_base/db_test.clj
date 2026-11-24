(ns metabase.transforms-base.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.test :as mt]
   [metabase.transforms-base.db :as transforms-base.db]
   [toucan2.core :as t2]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                mdb/select-partition-size       2
                mdb/delete-partition-size       2
                mdb/update-partition-size       2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (let [tables (t2/select [:model/Table :id :db_id :schema :name]
                          :id [:in [(mt/id :venues) (mt/id :checkins) (mt/id :users)]])
        refs   (mapv (juxt :db_id :schema :name) tables)]
    (testing "each table once from partitions of repeated refs"
      (is (= (sort (map :id tables))
             (sort (map :id (transforms-base.db/table-refs-matching (into refs refs))))
             (sort (map :id (partitioned! #(transforms-base.db/table-refs-matching (into refs refs))))))))
    (testing "tables by name from partitions"
      (is (= (set (map :id (transforms-base.db/active-tables-named refs)))
             (set (map :id (partitioned! #(transforms-base.db/active-tables-named refs)))))))))
