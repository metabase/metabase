(ns metabase-enterprise.transforms-python.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.db :as transforms-python.db]
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
  (let [table-ids [(mt/id :venues) (mt/id :checkins) (mt/id :users)]]
    (testing "a set from partitions"
      (is (= #{(mt/id)}
             (transforms-python.db/table-database-ids table-ids)
             (partitioned! #(transforms-python.db/table-database-ids table-ids)))))))
