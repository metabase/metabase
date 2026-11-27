(ns metabase.sync.metadata-sync.stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- tables [db-id]
  (tables/selection db-id nil))

(deftest row-count-test
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {orders :id} {:db_id db-id :name "orders" :estimated_row_count 42}]
    (testing "a Table's stats entry holds its estimated row count"
      (is (= {orders {:estimated_row_count 42 :field_values []}}
             (stats/table-stats (tables db-id)))))))

(deftest full-field-values-test
  (mt/with-temp [:model/Database    {db-id :id}  {}
                 :model/Table       {orders :id} {:db_id db-id :name "orders"}
                 :model/Field       {status :id} {:table_id orders :name "status" :base_type :type/Text
                                                  :has_field_values :list}
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
                 :model/Field       {status :id} {:table_id orders :name "status" :base_type :type/Integer
                                                  :has_field_values :list}
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

(deftest values-of-fields-that-may-have-none-are-not-sent-test
  (mt/with-temp [:model/Database    {db-id :id}  {}
                 :model/Table       {orders :id} {:db_id db-id :name "orders"}
                 :model/Field       {status :id} {:table_id orders :name "status" :base_type :type/Text
                                                  :has_field_values :list}
                 :model/Field       {secret :id} {:table_id orders :name "secret" :base_type :type/Text
                                                  :visibility_type :sensitive :has_field_values :list}
                 :model/Field       {unused :id} {:table_id orders :name "unused" :base_type :type/Text
                                                  :visibility_type :hidden :has_field_values :list}
                 :model/FieldValues _            {:field_id status :type :full :values ["open"]}
                 :model/FieldValues _            {:field_id secret :type :full :values ["left from before"]}
                 :model/FieldValues _            {:field_id unused :type :full :values ["left from before"]}]
    (testing "the values of a sensitive or hidden Field are not sent, also when it still has a row of them"
      (is (= [["status"]]
             (mapv :field (get-in (stats/table-stats (tables db-id)) [orders :field_values])))))
    (testing "and they do not weigh in the counts"
      (is (= [{:table_id orders :field_values_count 1}] (sync.db/described-full-field-values-counts db-id))))))

(deftest values-of-fields-that-no-longer-get-values-are-not-sent-test
  (mt/with-temp [:model/Database    {db-id :id}   {}
                 :model/Table       {orders :id}  {:db_id db-id :name "orders"}
                 :model/Field       {status :id}  {:table_id orders :name "status" :base_type :type/Text
                                                   :has_field_values :auto-list}
                 :model/Field       {search :id}  {:table_id orders :name "search" :base_type :type/Text
                                                   :has_field_values :search}
                 :model/Field       {none :id}    {:table_id orders :name "none" :base_type :type/Text
                                                   :has_field_values :none}
                 :model/Field       {long :id}    {:table_id orders :name "long" :base_type :type/Text
                                                   :has_field_values :list :preview_display false}
                 :model/FieldValues _             {:field_id status :type :full :values ["open"]}
                 :model/FieldValues _             {:field_id search :type :full :values ["left from before"]}
                 :model/FieldValues _             {:field_id none :type :full :values ["left from before"]}
                 :model/FieldValues _             {:field_id long :type :full :values ["left from before"]}]
    (testing "only a Field that sync gives a list of values sends one: a row left from before is not sent"
      (is (= [["status"]]
             (mapv :field (get-in (stats/table-stats (tables db-id)) [orders :field_values])))))
    (testing "and the others do not weigh in the counts"
      (is (= [{:table_id orders :field_values_count 1}] (sync.db/described-full-field-values-counts db-id))))))

(deftest values-of-tables-that-sync-leaves-alone-are-not-sent-test
  (mt/with-temp [:model/Database    {db-id :id}  {}
                 :model/Table       {orders :id} {:db_id db-id :name "orders" :data_layer :hidden}
                 :model/Field       {status :id} {:table_id orders :name "status" :base_type :type/Text
                                                  :has_field_values :list}
                 :model/FieldValues _            {:field_id status :type :full :values ["left from before"]}]
    (testing "a hidden Table, which sync does not keep up to date, sends no values"
      (is (= [] (get-in (stats/table-stats (tables db-id)) [orders :field_values] [])))
      (is (= [] (sync.db/described-full-field-values-counts db-id))))))
