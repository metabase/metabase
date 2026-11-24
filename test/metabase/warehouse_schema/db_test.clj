(ns metabase.warehouse-schema.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [toucan2.core :as t2]))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids (into #{} (take 5) (t2/select-pks-vec :model/Table :db_id (mt/id) {:order-by [[:id :asc]]}))
        field-ids (into [] (take 5) (t2/select-pks-vec :model/Field :table_id [:in table-ids] {:order-by [[:id :asc]]}))]
    (testing "rows ordered by Table first keep their order"
      (let [f #(warehouse-schema.db/field-ids-for-tables-ordered table-ids :alphabetical)]
        (is (= (f) (mt/with-partition-size 2 (f))))))
    (testing "rows ordered within each Table keep their order there"
      (let [f #(update-vals (group-by :table_id (warehouse-schema.db/active-fields-for-tables table-ids))
                            (partial map :id))]
        (is (= (f) (mt/with-partition-size 2 (f))))))
    (testing "maps and sets hold every row"
      (doseq [f [#(warehouse-schema.db/fields-by-ids field-ids)
                 #(warehouse-schema.db/pk-field-ids-by-table (vec table-ids))
                 #(warehouse-schema.db/field-ids-for-tables (vec table-ids))]]
        (is (= (f) (mt/with-partition-size 2 (f))))))
    (testing "updates add up the rows of every partition"
      (mt/with-temp [:model/Table {table-id :id} {}
                     :model/Field {id-1 :id} {:table_id table-id}
                     :model/Field {id-2 :id} {:table_id table-id}
                     :model/Field {id-3 :id} {:table_id table-id}
                     :model/Field {id-4 :id} {:table_id table-id}
                     :model/Field {id-5 :id} {:table_id table-id}]
        (let [ids [id-1 id-2 id-3 id-4 id-5]]
          (is (= 5 (warehouse-schema.db/set-fields-active! ids false)))
          (is (= 5 (mt/with-partition-size 2 (warehouse-schema.db/set-fields-active! ids true))))
          (is (= #{true} (t2/select-fn-set :active :model/Field :id [:in ids]))))))))
