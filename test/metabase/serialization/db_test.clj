(ns metabase.serialization.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.db :as serialization.db]
   [metabase.test :as mt]))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids   [(mt/id :venues) (mt/id :checkins) (mt/id :users)]
        field-names ["ID" "NAME" "DATE" "PRICE" "LAST_LOGIN"]]
    (testing "rows over partitions of two lists"
      (is (= (set (map :id (serialization.db/top-level-fields-by-names table-ids field-names [:id])))
             (set (map :id (mt/with-partition-size 2 (serialization.db/top-level-fields-by-names table-ids field-names [:id])))))))
    (testing "rows by primary key over partitions"
      (is (= (set table-ids)
             (set (map :id (mt/with-partition-size 2 (serialization.db/rows-by-pks :model/Table table-ids [:id])))))))))
