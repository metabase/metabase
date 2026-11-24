(ns metabase.analyze.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.db :as analyze.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids (t2/select-pks-vec :model/Table :db_id (mt/id) {:order-by [[:id :asc]]})]
    (testing "counts grouped by Table"
      (let [f #(analyze.db/normal-field-counts table-ids)]
        (is (seq (f)))
        (is (= (f) (mt/with-partition-size 2 (f))))))
    (testing "the first Fields of each Table, lowest id first"
      (let [f #(mapv :id (analyze.db/normal-fields table-ids 2))]
        (is (= (f) (mt/with-partition-size 2 (f))))))
    (testing "the first Fields after an id, over every Table, lowest id first"
      (let [f #(mapv :id (analyze.db/data-sensitivity-fields table-ids true 0 3))]
        (is (= 3 (count (f))))
        (is (= (f) (mt/with-partition-size 2 (f))))))))
