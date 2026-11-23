(ns metabase.sync.updates-test
  "The bulk updates sync makes to Fields and Tables run a number of statements that does not grow with their number."
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.sync.updates :as sync.updates]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-fields!
  "The ids of `n` new Fields of the Table with `table-id`."
  [table-id n]
  (vec (t2/insert-returning-pks! :model/Field
                                 (for [i (range n)]
                                   {:table_id table-id :name (str "F" i) :base_type :type/Integer
                                    :database_type "INTEGER" :position 0}))))

(deftest update-fields-by-id-statement-count-does-not-grow-with-fields-test
  (let [counted (fn [n change]
                  (mt/with-temp [:model/Database db {}
                                 :model/Table {table-id :id} {:db_id (:id db)}]
                    (let [ids (insert-fields! table-id n)]
                      (events.tu/statement-count!
                       #(sync.updates/update-fields-by-id-unless-user-set!
                         (into {} (map-indexed (fn [i id] [id (change i)])) ids))))))]
    (testing "Fields that each get a change of their own cost at most 2 statements each: an UPDATE and the SELECT of its hook"
      (let [change (fn [i] {:description (str "described " i) :database_type (str "TYPE" i)})]
        (counted 1 change)
        (is (<= (- (counted 6 change) (counted 2 change)) (* 2 4)))))))

(deftest update-tables-unless-user-set-statement-count-does-not-grow-with-tables-test
  (let [counted (fn [n change]
                  (mt/with-temp [:model/Database db {}]
                    (let [tables (vec (for [i (range n)]
                                        (first (t2/insert-returning-instances! :model/Table {:db_id (:id db) :name (str "T" i) :active true}))))]
                      (events.tu/statement-count!
                       #(sync.updates/update-tables-unless-user-set!
                         (vec (map-indexed (fn [i table] [table (change i)]) tables)))))))]
    (testing "Tables that each get a change of their own cost at most 2 statements each"
      (let [change (fn [i] {:description (str "described " i)})]
        (counted 1 change)
        (is (<= (- (counted 6 change) (counted 2 change)) (* 2 4)))))))

(deftest unset-user-values-for-fields-statement-count-does-not-grow-with-fields-test
  (let [counted (fn [n]
                  (mt/with-temp [:model/Database db {}
                                 :model/Table {table-id :id} {:db_id (:id db)}]
                    (let [ids (insert-fields! table-id n)]
                      (doseq [id ids]
                        (t2/insert! :model/FieldUserSettings {:field_id id :description "mine" :description_set true}))
                      (events.tu/statement-count!
                       #(field-user-settings/unset-field-user-settings-for-fields! ids [:description])))))]
    (counted 1)
    (is (= (counted 2) (counted 6)))))
