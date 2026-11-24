(ns metabase.sync.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.sync.db :as sync.db]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- in-small-partitions!
  "What `f` returns when reads take at most two ids per statement."
  [f]
  (with-redefs [mdb.query/select-partition-size 2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (let [tables    (t2/select [:model/Table :id :name :schema] :db_id (mt/id) {:order-by [[:id :asc]]})
        table-ids (mapv :id tables)
        fields    (t2/select [:model/Field :id :name :table_id] :table_id [:in table-ids] :parent_id nil)
        by-id     (into {} (map (juxt :id identity)) tables)]
    (testing "rows matched by names in several partitions"
      (let [f #(sort (map :id (sync.db/active-tables-by-lower-names (mt/id) (mapv (comp u/lower-case-en :name) tables))))]
        (is (seq (f)))
        (is (= (f) (in-small-partitions! f)))))
    (testing "rows matched by two lists in several partitions each"
      (mt/with-temp [:model/Table {table-1 :id} {}
                     :model/Table {table-2 :id} {}
                     :model/Table {table-3 :id} {}
                     :model/Field {field-1 :id} {:table_id table-1, :name "A", :active false}
                     :model/Field {field-2 :id} {:table_id table-2, :name "B", :active false}
                     :model/Field {field-3 :id} {:table_id table-3, :name "C", :active false}
                     :model/Field _             {:table_id table-3, :name "D", :active false}]
        (let [f #(sort (map :id (sync.db/inactive-top-level-fields-by-lower-name-for-tables
                                 [table-1 table-2 table-3] ["a" "b" "c"])))]
          (is (= (sort [field-1 field-2 field-3]) (f) (in-small-partitions! f))))))
    (testing "a reducible over several partitions of triples"
      (let [triples (mapv (fn [{:keys [name table_id]}]
                            (let [{table-name :name schema :schema} (by-id table_id)]
                              [(or schema "__null__") table-name name]))
                          fields)
            f       #(sort (into [] (map :id) (sync.db/top-level-field-ids-by-schema-table-and-name-reducible (mt/id) triples)))]
        (is (= (sort (map :id fields)) (f) (in-small-partitions! f)))))
    (testing "foreign keys resolved over partitions of table names and ids"
      (let [entries [{:fk-table-schema "PUBLIC" :fk-table-name "CHECKINS" :fk-column-name "USER_ID"
                      :pk-table-schema "PUBLIC" :pk-table-name "VENUES" :pk-column-name "ID"}
                     {:fk-table-schema "PUBLIC" :fk-table-name "CHECKINS" :fk-column-name "VENUE_ID"
                      :pk-table-schema "PUBLIC" :pk-table-name "USERS" :pk-column-name "ID"}
                     {:fk-table-schema "PUBLIC" :fk-table-name "VENUES" :fk-column-name "CATEGORY_ID"
                      :pk-table-schema "PUBLIC" :pk-table-name "CHECKINS" :pk-column-name "ID"}]
            f       #(sync.db/fk-target-changes-for-entries (mt/id) entries)]
        (is (= 3 (count (f))))
        (is (= (f) (in-small-partitions! f)))))))
