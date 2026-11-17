(ns metabase.sync.metadata-sync.stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- tables [db-id]
  (t2/select :model/Table :db_id db-id {:order-by [:name]}))

(deftest row-count-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {orders :id} {:db_id db-id :name "orders" :estimated_row_count 42}]
    (testing "a Table's stats entry holds its estimated row count"
      (is (= {orders {:estimated_row_count 42 :field_values []}}
             (stats/table-stats (tables db-id)))))))

(deftest full-field-values-test
  (mt/with-temp [:model/Database    {db-id :id}  {}
                 :model/Table       {orders :id} {:db_id db-id :name "orders"}
                 :model/Field       {status :id} {:table_id orders :name "status" :base_type :type/Text}
                 :model/Field       {kind :id}   {:table_id orders :name "kind" :base_type :type/Text}
                 :model/FieldValues _            {:field_id status :type :full :values ["closed" "open"]
                                                  :has_more_values true}
                 :model/FieldValues _            {:field_id kind :type :sandbox :hash_key "abc" :values ["mine"]}]
    (testing "a Field's :full values are in the entry, by Field path, with has_more_values"
      (is (= {orders {:field_values [{:field ["status"] :values ["closed" "open"] :has_more_values true}]}}
             (stats/table-stats (tables db-id)))))))

(deftest labels-are-not-sent-test
  (mt/with-temp [:model/Database    {db-id :id}  {}
                 :model/Table       {orders :id} {:db_id db-id :name "orders"}
                 :model/Field       {status :id} {:table_id orders :name "status" :base_type :type/Integer}
                 :model/Dimension   _            {:field_id status :name "Status" :type :internal}
                 :model/FieldValues _            {:field_id status :type :full :values [1 2]
                                                  :human_readable_values ["Open" "Closed"]}]
    (testing "the labels of an internal display remap are not in the entry: display remaps are not sent"
      (is (= [{:field ["status"] :values [1 2] :has_more_values false}]
             (get-in (stats/table-stats (tables db-id)) [orders :field_values]))))))

(deftest no-stats-test
  (mt/with-temp [:model/Database    {db-id :id}   {}
                 :model/Table       {orders :id}  {:db_id db-id :name "orders"}
                 :model/Field       {retired :id} {:table_id orders :name "old" :base_type :type/Text
                                                   :visibility_type :retired}
                 :model/Field       {gone :id}    {:table_id orders :name "gone" :base_type :type/Text :active false}
                 :model/FieldValues _             {:field_id retired :type :full :values ["a"]}
                 :model/FieldValues _             {:field_id gone :type :full :values ["b"]}]
    (testing "the values of a Field that is not described are left out, and a Table with no stats has no entry"
      (is (= {} (stats/table-stats (tables db-id)))))))
