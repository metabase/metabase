(ns metabase.lib-be.task.backfill-entity-ids-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.task.backfill-entity-ids :as backfill-entity-ids]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro with-sample-data [& body]
  `(mt/with-temp
     [:model/Database {~'db-id :id} {}
      :model/Table {~'table-id :id} {}
      :model/Field {~'field1-id :id} {}
      :model/Field {~'field2-id :id} {}
      :model/Field {~'field3-id :id} {:entity_id "an entity id_________"}]
     ~@body))

(deftest backfill-databases-test
  (testing "Can backfill databases"
    (with-sample-data
      (backfill-entity-ids/backfill-entity-ids!-inner :model/Database)
      (is (not (nil? (:entity_id (t2/select-one :model/Database :id db-id)))))
      (is (nil? (:entity_id (t2/select-one :model/Table :id table-id))))
      (is (nil? (:entity_id (t2/select-one :model/Field :id field1-id)))))))

(deftest backfill-tables-test
  (testing "Can backfill tables"
    (with-sample-data
      (backfill-entity-ids/backfill-entity-ids!-inner :model/Table)
      (is (not (nil? (:entity_id (t2/select-one :model/Table :id table-id)))))
      (is (nil? (:entity_id (t2/select :model/Database :id db-id))))
      (is (nil? (:entity_id (t2/select :model/Field :id field1-id)))))))

(deftest backfill-fields-test
  (testing "Can backfill fields"
    (with-sample-data
      (backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
      (is (not (nil? (:entity_id (t2/select-one :model/Field :id field1-id)))))
      (is (not (nil? (:entity_id (t2/select-one :model/Field :id field2-id)))))
      (is (=? {:entity_id "an entity id_________"}
              (t2/select-one :model/Field :id field3-id)))
      (is (nil? (:entity_id (t2/select :model/Database :id db-id))))
      (is (nil? (:entity_id (t2/select :model/Table :id table-id)))))))

(deftest backfill-limit-test
  (testing "Only backfills up to batch-size records"
    (binding [backfill-entity-ids/*batch-size* 1]
      (with-sample-data
        (backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
        (let [fields (t2/select :model/Field
                                {:select [:*]
                                 :from (t2/table-name :model/Field)
                                 :where [:or
                                         [:= :id field1-id]
                                         [:= :id field2-id]
                                         [:= :id field3-id]]})]
          (is (= 1 (count (filter #(nil? (:entity_id %)) fields))))
          (is (= 2 (count (filter #(not (nil? (:entity_id %))) fields)))))))))
