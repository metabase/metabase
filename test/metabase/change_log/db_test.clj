(ns metabase.change-log.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.change-log.db :as change-log.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest positions-and-row-reads-over-partitions-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (change-log.db/insert-entries! (for [row-id (range 5)] {:table_name "report_card", :row_id (+ 900000 row-id), :action "insert"}))
    (let [ids       (vec (t2/select-pks-vec :change_log :table_name "report_card" :row_id [:in (range 900000 900005)] {:order-by [[:id :asc]]}))
          lowest-id (first ids)
          row-ids   (range 900000 900005)]
      (is (= 5 (count ids)))
      (is (= (count ids) (mt/with-partition-size 2 (change-log.db/set-positions! ids 7 lowest-id))))
      (is (= (map #(+ 7 (- % lowest-id)) ids)
             (t2/select-fn-vec :position :change_log :id [:in ids] {:order-by [[:id :asc]]})))
      (is (= (set (change-log.db/rows-where "change_log" :row_id row-ids [:row_id]))
             (set (mt/with-partition-size 2 (change-log.db/rows-where "change_log" :row_id row-ids [:row_id]))))))))
