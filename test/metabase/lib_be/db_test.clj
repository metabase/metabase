(ns metabase.lib-be.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.db :as lib-be.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids (set (t2/select-pks-vec :model/Table :db_id (mt/id)))
        field-ids (set (take 5 (t2/select-pks-vec :model/Field :table_id [:in table-ids] {:order-by [[:id :asc]]})))]
    (testing "rows matched by ids"
      (let [f #(sort (map :id (lib-be.db/columns (mt/id) {:lib/type :metadata/column, :id field-ids})))]
        (is (= (sort field-ids) (f) (mt/with-partition-size 2 (f))))))
    (testing "rows matched by Table ids"
      (let [f #(sort (map :id (lib-be.db/columns (mt/id) {:lib/type :metadata/column, :table-ids table-ids})))]
        (is (seq (f)))
        (is (= (f) (mt/with-partition-size 2 (f))))))))
