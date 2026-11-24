(ns metabase.transforms-base.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms-base.db :as transforms-base.db]
   [toucan2.core :as t2]))

(deftest ^:synchronized reads-over-partitions-test
  (let [tables (t2/select [:model/Table :id :db_id :schema :name]
                          :id [:in [(mt/id :venues) (mt/id :checkins) (mt/id :users)]])
        refs   (mapv (juxt :db_id :schema :name) tables)]
    (testing "each table once from partitions of repeated refs"
      (is (= (sort (map :id tables))
             (sort (map :id (transforms-base.db/table-refs-matching (into refs refs))))
             (sort (map :id (mt/with-partition-size 2 (transforms-base.db/table-refs-matching (into refs refs))))))))
    (testing "tables by name from partitions"
      (is (= (set (map :id (transforms-base.db/active-tables-named refs)))
             (set (map :id (mt/with-partition-size 2 (transforms-base.db/active-tables-named refs)))))))))
