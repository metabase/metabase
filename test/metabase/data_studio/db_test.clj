(ns metabase.data-studio.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.data-studio.db :as data-studio.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- in-small-partitions!
  "What `f` returns when reads take at most two ids per statement."
  [f]
  (with-redefs [mdb.query/select-partition-size 2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (let [table-ids (t2/select-pks-vec :model/Table :db_id (mt/id) {:order-by [[:id :asc]]})
        selectors {:database_ids [(mt/id)]
                   :table_ids    (take 5 table-ids)
                   :schema_ids   [(str (mt/id) ":PUBLIC")]}]
    (testing "Tables matched by several selectors, each once"
      (let [f #(mapv :id (data-studio.db/tables-matching-selectors-in-id-order selectors))]
        (is (= table-ids (f) (in-small-partitions! f)))))
    (testing "at most `limit` Tables, each once"
      (let [f #(count (data-studio.db/selection-columns-for-selectors selectors 3))]
        (is (= 3 (f) (in-small-partitions! f)))))
    (testing "remapped Tables leave out the excluded ones"
      (mt/with-temp [:model/Table     {source :id} {}
                     :model/Table     {target :id} {}
                     :model/Table     {other :id}  {}
                     :model/Field     {field-1 :id} {:table_id source}
                     :model/Field     {field-2 :id} {:table_id target}
                     :model/Field     {field-3 :id} {:table_id other}
                     :model/Dimension _            {:field_id field-1, :human_readable_field_id field-2, :type :external}
                     :model/Dimension _            {:field_id field-3, :human_readable_field_id field-1, :type :external}]
        (let [f #(into #{} (map :table_id) (data-studio.db/fk-remapped-table-ids-for-tables
                                            :source_field.table_id :target_field.table_id
                                            #{source other} #{source other}))]
          (is (= #{target} (f) (in-small-partitions! f))))))))
