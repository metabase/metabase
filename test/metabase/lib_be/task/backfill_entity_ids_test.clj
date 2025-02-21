(ns metabase.lib-be.task.backfill-entity-ids-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.task.backfill-entity-ids :as backfill-entity-ids]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn with-sample-data [f]
  (mt/with-temp
    [:model/Database {db-id :id :as db} {}
     :model/Table {table-id :id :as table} {}
     :model/Field {field1-id :id :as field1} {}
     :model/Field {field2-id :id :as field2} {}
     :model/Field {field3-id :id :as field3} {:entity_id "an entity id_________"}]
    (f {:db-id db-id
        :table-id table-id
        :field1-id field1-id
        :field2-id field2-id
        :field3-id field3-id
        :db db
        :table table
        :field1 field1
        :field2 field2
        :field3 field3})))

(deftest ^:parallel backfill-databases-test
  (testing "Can backfill databases"
    (with-sample-data
      (fn [{:keys [db-id table-id field1-id]}]
        (backfill-entity-ids/backfill-entity-ids!-inner :model/Database)
        (is (not (nil? (:entity_id (t2/select-one :model/Database :id db-id)))))
        (is (nil? (:entity_id (t2/select-one :model/Table :id table-id))))
        (is (nil? (:entity_id (t2/select-one :model/Field :id field1-id))))))))

(deftest ^:parallel backfill-tables-test
  (testing "Can backfill tables"
    (with-sample-data
      (fn [{:keys [db-id table-id field1-id]}]
        (backfill-entity-ids/backfill-entity-ids!-inner :model/Table)
        (is (not (nil? (:entity_id (t2/select-one :model/Table :id table-id)))))
        (is (nil? (:entity_id (t2/select :model/Database :id db-id))))
        (is (nil? (:entity_id (t2/select :model/Field :id field1-id))))))))

(deftest ^:parallel backfill-fields-test
  (testing "Can backfill fields"
    (with-sample-data
      (fn [{:keys [db-id table-id field1-id field2-id field3-id]}]
        (backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
        (is (not (nil? (:entity_id (t2/select-one :model/Field :id field1-id)))))
        (is (not (nil? (:entity_id (t2/select-one :model/Field :id field2-id)))))
        (is (=? {:entity_id "an entity id_________"}
                (t2/select-one :model/Field :id field3-id)))
        (is (nil? (:entity_id (t2/select :model/Database :id db-id))))
        (is (nil? (:entity_id (t2/select :model/Table :id table-id))))))))

(deftest ^:parallel backfill-limit-test
  (testing "Only backfills up to batch-size records"
    (binding [backfill-entity-ids/*batch-size* 1]
      (with-sample-data
        (fn [{:keys [field1-id field2-id field3-id]}]
          (backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
          (let [fields (t2/select :model/Field
                                  {:select [:*]
                                   :from (t2/table-name :model/Field)
                                   :where [:or
                                           [:= :id field1-id]
                                           [:= :id field2-id]
                                           [:= :id field3-id]]})]
            (is (= 1 (count (filter #(nil? (:entity_id %)) fields))))
            (is (= 2 (count (filter #(not (nil? (:entity_id %))) fields))))))))))

(deftest ^:synchronized backfill-ignores-failed-rows-test
  (testing "Doesn't backfill failed rows"
    (with-sample-data
      (fn [{:keys [field1-id field2-id field3-id]}]
        (backfill-entity-ids/add-failed-row! field2-id)
        (backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
        (backfill-entity-ids/reset-failed-rows!)
        (is (not (nil? (:entity_id (t2/select-one :model/Field :id field1-id)))))
        (is (nil? (:entity_id (t2/select-one :model/Field :id field2-id))))
        (is (=? {:entity_id "an entity id_________"}
                (t2/select-one :model/Field :id field3-id)))))))

(deftest ^:synchronized backfill-adds-failures-to-failed-rows-test
  (testing "Adds t2/update! failures to failed rows"
    (with-sample-data
      (fn [{:keys [field1-id field2-id]}]
        (with-redefs [t2/update! (fn [& _] (throw (Exception. "an exception")))]
          (backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
          (is (= #{field1-id field2-id}
                 @backfill-entity-ids/failed-rows))
          (is (nil? (:entity_id (t2/select-one :model/Field :id field1-id))))

          (is (nil? (:entity_id (t2/select-one :model/Field :id field2-id))))
          (backfill-entity-ids/reset-failed-rows!))))))
