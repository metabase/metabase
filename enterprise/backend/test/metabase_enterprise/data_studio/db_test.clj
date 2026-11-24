(ns metabase-enterprise.data-studio.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.db :as data-studio.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:synchronized reads-over-partitions-test
  (testing "remapped Tables leave out the given ones"
    (mt/with-temp [:model/Table     {source :id}  {}
                   :model/Table     {target :id}  {}
                   :model/Table     {other :id}   {}
                   :model/Field     {field-1 :id} {:table_id source}
                   :model/Field     {field-2 :id} {:table_id target}
                   :model/Field     {field-3 :id} {:table_id other}
                   :model/Dimension _             {:field_id field-1, :human_readable_field_id field-2, :type :external}
                   :model/Dimension _             {:field_id field-3, :human_readable_field_id field-1, :type :external}]
      (let [f #(into #{} (map :table_id) (data-studio.db/remapped-table-ids-reducible :source_field :target_field
                                                                                      #{source other}))]
        (is (= #{target} (f) (mt/with-partition-size 2 (f)))))))
  (testing "Tables matched by selectors or extra ids, as one set"
    (let [table-ids (t2/select-pks-vec :model/Table :db_id (mt/id) {:order-by [[:id :asc]]})
          f         #(data-studio.db/table-ids-matching-selectors {:table-ids (take 3 table-ids)}
                                                                  (set (take-last 3 table-ids))
                                                                  :any)]
      (is (= (into (set (take 3 table-ids)) (take-last 3 table-ids)) (f) (mt/with-partition-size 2 (f)))))))
