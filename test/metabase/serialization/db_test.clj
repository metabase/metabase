(ns metabase.serialization.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as app-db]
   [metabase.app-db.query :as mdb.query]
   [metabase.serialization.db :as serialization.db]
   [metabase.test :as mt]))

(defn- partitioned!
  "Call `f` with every partition size of the app DB set to 2."
  [f]
  (with-redefs [mdb.query/select-partition-size 2
                app-db/select-partition-size    2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids   [(mt/id :venues) (mt/id :checkins) (mt/id :users)]
        field-names ["ID" "NAME" "DATE" "PRICE" "LAST_LOGIN"]]
    (testing "rows over partitions of two lists"
      (is (= (set (map :id (serialization.db/top-level-fields-by-names table-ids field-names [:id])))
             (set (map :id (partitioned! #(serialization.db/top-level-fields-by-names table-ids field-names [:id])))))))
    (testing "rows by primary key over partitions"
      (is (= (set table-ids)
             (set (map :id (partitioned! #(serialization.db/rows-by-pks :model/Table table-ids [:id])))))))))
