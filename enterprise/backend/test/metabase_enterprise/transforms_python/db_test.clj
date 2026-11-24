(ns metabase-enterprise.transforms-python.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.db :as transforms-python.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids [(mt/id :venues) (mt/id :checkins) (mt/id :users)]]
    (testing "a set from partitions"
      (is (= #{(mt/id)}
             (transforms-python.db/table-database-ids table-ids)
             (mt/with-partition-size 2 (transforms-python.db/table-database-ids table-ids)))))))
