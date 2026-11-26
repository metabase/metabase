(ns metabase.sync.updates-test
  "The bulk updates sync makes to Fields and Tables run a number of statements that does not grow with their number."
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.sync.updates :as sync.updates]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouses.db :as warehouses.db]
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
    (testing "Fields that get the same change"
      (counted 1 (constantly {:description "same" :database_type "SAME"}))
      (is (= (counted 2 (constantly {:description "same" :database_type "SAME"}))
             (counted 6 (constantly {:description "same" :database_type "SAME"})))))
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
    (testing "Tables that get the same change"
      (counted 1 (constantly {:description "same"}))
      (is (= (counted 2 (constantly {:description "same"})) (counted 6 (constantly {:description "same"})))))
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

(defn- write-while-database-locked!
  "Run `write!` on another thread while a transaction holds the lock of the Database with `db-id`, returning whether it
  was still waiting after half a second and whether it finished once the lock was released."
  [db-id write!]
  (let [locked  (promise)
        release (promise)
        holder  (future
                  (t2/with-transaction [_conn]
                    (warehouses.db/lock-databases! [db-id])
                    (deliver locked true)
                    @release))
        _       (deref locked 10000 nil)
        writer  (future (write!) ::written)
        waiting (try
                  (= ::waiting (deref writer 500 ::waiting))
                  (finally
                    (deliver release true)))]
    (deref holder 10000 nil)
    {:waiting? waiting
     :written? (= ::written (deref writer 30000 ::timeout))}))

(deftest sync-field-writes-take-database-lock-first-test
  (mt/with-model-cleanup [:model/Database]
    (let [db-id               (t2/insert-returning-pk! :model/Database {:name "Lock First" :engine :h2 :details {}})
          table-id            (t2/insert-returning-pk! :model/Table {:db_id db-id :name "T" :active true})
          [field-id other-id] (insert-fields! table-id 2)]
      (testing "sync writes of Fields and FieldValues lock their Database before their own rows"
        (testing "update-fields!"
          (is (= {:waiting? true :written? true}
                 (write-while-database-locked! db-id #(sync.updates/update-fields! [{:id field-id :description "d"}]))))
          (is (= "d" (t2/select-one-fn :description :model/Field :id field-id))))
        (testing "create-fields!"
          (is (= {:waiting? true :written? true}
                 (write-while-database-locked! db-id #(sync.updates/create-fields! [{:table_id      table-id
                                                                                     :name          "H"
                                                                                     :base_type     :type/Text
                                                                                     :database_type "VARCHAR"}])))))
        (testing "save-field-values-changes!"
          (is (= {:waiting? true :written? true}
                 (write-while-database-locked! db-id #(sync.updates/save-field-values-changes!
                                                       [other-id]
                                                       [{:create {:field_id              other-id
                                                                  :type                  :full
                                                                  :has_more_values       false
                                                                  :values                ["b"]
                                                                  :human_readable_values nil}}]))))
          (is (t2/exists? :model/FieldValues :field_id other-id))))
      (testing "Field writes outside sync take no lock of their Database"
        (is (= {:waiting? false :written? true}
               (write-while-database-locked! db-id #(field/update-fields! [{:id field-id :description "e"}]))))))))
