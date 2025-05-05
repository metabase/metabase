(ns metabase.lib-be.task.backfill-entity-ids-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.task.backfill-entity-ids :as backfill-entity-ids]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn with-sample-data!
  "Run f in a context where a specific set of 5 rows exist in the application db and every row for a given model that
  isn't in that sample data has been added to failed-rows."
  [f]
  (reset! serdes/entity-id-cache {})
  (mt/with-temp
    [:model/Database {db-id :id :as db} {}
     :model/Table {table-id :id :as table} {}
     :model/Field {field1-id :id :as field1} {:table_id table-id}
     :model/Field {field2-id :id :as field2} {:table_id table-id}
     :model/Field {field3-id :id :as field3} {:entity_id "an entity id_________" :table_id table-id}
     :model/Card {card-id :id :as card}]
    (reset! serdes/entity-id-cache {})
    (f {:db-id db-id
        :table-id table-id
        :field1-id field1-id
        :field2-id field2-id
        :field3-id field3-id
        :card-id card-id
        :db db
        :table table
        :field1 field1
        :field2 field2
        :field3 field3
        :card card})))

(deftest ^:synchronized backfill-databases-test
  (testing "Can backfill databases"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id]}]
        (binding [backfill-entity-ids/*backfill-batch-size* 5000]
          (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Database))
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Database db-id]))))
        (is (not (contains? (:model/Table @serdes/entity-id-cache) table-id)))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field1-id)))))))

(deftest ^:synchronized backfill-tables-test
  (testing "Can backfill tables"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id]}]
        (binding [backfill-entity-ids/*backfill-batch-size* 5000]
          (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Table))
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Table table-id]))))
        (is (not (contains? (:model/Database @serdes/entity-id-cache) db-id)))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field1-id)))))))

(deftest ^:synchronized backfill-fields-test
  (testing "Can backfill fields"
    (with-sample-data!
      (fn [{:keys [db-id table-id field3-id]}]
        (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
        ;; we only backfill 1 random field at a time, so we can't be confident we backfilled any particular field
        (is (seq (:model/Field @serdes/entity-id-cache)))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field3-id)))
        (is (not (contains? (:model/Database @serdes/entity-id-cache) db-id)))
        (is (not (contains? (:model/Table @serdes/entity-id-cache) table-id)))))))

(deftest ^:synchronized backfill-all-table-fields-test
  (testing "Will backfill all fields from a given table at once"
    (with-sample-data!
      (fn [{:keys [field1-id field2-id field3-id]}]
        (t2/select-one :model/Field field1-id)
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Field field1-id]))))
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Field field2-id]))))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field3-id)))))))

(deftest ^:synchronized backfill-cards-test
  (testing "Can backfill cards"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id card-id]}]
        (binding [serdes/*skip-entity-id-calc* true]
          (t2/update! :model/Card card-id {:entity_id nil}))
        (binding [backfill-entity-ids/*backfill-batch-size* 5000]
          (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Card))
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Card card-id]))))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field1-id)))
        (is (not (contains? (:model/Database @serdes/entity-id-cache) db-id)))
        (is (not (contains? (:model/Table @serdes/entity-id-cache) table-id)))))))

(deftest ^:synchonized backfill-duplicates-test
  (testing "Can backfill duplicate entities"
    (with-sample-data!
      (fn [{:keys [db-id db]}]
        (mt/with-temp
          [:model/Database {db-id2 :id} (select-keys db [:name :engine])]
          (reset! serdes/entity-id-cache {})
          (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Database)
          (let [entity-id1 @(get-in @serdes/entity-id-cache [:model/Database db-id])
                entity-id2 @(get-in @serdes/entity-id-cache [:model/Database db-id2])]
            (is (not (nil? entity-id1)))
            (is (not (nil? entity-id2)))
            (is (not (= entity-id1 entity-id2)))))))))

(deftest ^:synchonized backfill-many-duplicates-test
  (testing "Can backfill many duplicate entities"
    (binding [serdes/*retry-batch-size* 3]
      (with-sample-data!
        (fn [{:keys [db-id db]}]
          (mt/with-temp
            [:model/Database {db-id2 :id} (select-keys db [:name :engine])
             :model/Database {db-id3 :id} (select-keys db [:name :engine])
             :model/Database {db-id4 :id} (select-keys db [:name :engine])
             :model/Database {db-id5 :id} (select-keys db [:name :engine])]
            (reset! serdes/entity-id-cache {})
            (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Database)
            (let [entity-ids (-> @serdes/entity-id-cache
                                 :model/Database
                                 (select-keys [db-id db-id2 db-id3 db-id4 db-id5])
                                 vals
                                 (->> (map deref)))]
              (is (every? some? entity-ids))
              ;; entity-ids are all unique
              (is (= 5 (count entity-ids))))))))))

(deftest ^:synchronized backfill-is-noop-when-cache-is-full-test
  (testing "Backfill exits early when there is already stuff in the cache"
    (with-sample-data!
      (fn [{:keys [db-id table-id]}]
        (reset! serdes/entity-id-cache {:model/Table {table-id (delay (u/generate-nano-id))}})
        (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Database)
        (is (not (contains? (:model/Database @serdes/entity-id-cache) db-id)))))))

(deftest ^:synchronized drain-test
  (testing "Drain works"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id field2-id card-id]}]
        (let [[db-eid table-eid field1-eid field2-eid card-eid] (repeatedly 5 u/generate-nano-id)]
          (reset! serdes/entity-id-cache {:model/Database {db-id (delay db-eid)}
                                          :model/Table {table-id (delay table-eid)}
                                          :model/Field {field1-id (delay field1-eid)
                                                        field2-id (delay field2-eid)}
                                          :model/Card {card-id (delay card-eid)}})
          (#'backfill-entity-ids/drain-entity-ids!)
          (binding [serdes/*skip-entity-id-calc* true]
            (is (= db-eid (:entity_id (t2/select-one :model/Database :id db-id))))
            (is (= table-eid (:entity_id (t2/select-one :model/Table :id table-id))))
            (is (= field1-eid (:entity_id (t2/select-one :model/Field :id field1-id))))
            (is (= field2-eid (:entity_id (t2/select-one :model/Field :id field2-id)))))
          (is (= {}
                 @serdes/entity-id-cache)))))))

(deftest ^:synchronized drain-does-not-clear-unused-entries-test
  (testing "Drain only clears drained ids from the cache"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id field2-id]}]
        (binding [backfill-entity-ids/*drain-batch-size* 3]
          (let [[db-eid table-eid field1-eid field2-eid] (repeatedly 4 u/generate-nano-id)]
            (reset! serdes/entity-id-cache {:model/Database {db-id (delay db-eid)}
                                            :model/Table {table-id (delay table-eid)}
                                            :model/Field {field1-id (delay field1-eid)
                                                          field2-id (delay field2-eid)}})
            (#'backfill-entity-ids/drain-entity-ids!)
            (is (= 1
                   (->> @serdes/entity-id-cache
                        vals
                        (map count)
                        (apply +))))))))))

(deftest ^:synchronized drain-does-not-clear-failures-test
  (testing "Drain doesn't clear failures from the cache"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id field2-id]}]
        (let [[db-eid table-eid field1-eid] (repeatedly 3 u/generate-nano-id)
              field2-eid-delay (delay field1-eid)]
          (reset! serdes/entity-id-cache {:model/Database {db-id (delay db-eid)}
                                          :model/Table {table-id (delay table-eid)}
                                          :model/Field {field1-id (delay field1-eid)
                                                        field2-id field2-eid-delay}})
          (#'backfill-entity-ids/drain-entity-ids!)
          (is (= {:model/Field {field2-id field2-eid-delay}}
                 @serdes/entity-id-cache)))))))

(deftest ^:synchronized select-uses-cached-eids-when-present-test
  (testing "Selecting something uses cached values when present"
    (with-sample-data!
      (fn [{:keys [db-id table-id field1-id field2-id card-id]}]
        (let [[db-eid table-eid field1-eid field2-eid card-eid] (repeatedly 5 u/generate-nano-id)]
          (t2/update! (t2/table-name :model/Card) card-id {:entity_id nil})
          (reset! serdes/entity-id-cache {:model/Database {db-id (delay db-eid)}
                                          :model/Table {table-id (delay table-eid)}
                                          :model/Field {field1-id (delay field1-eid)
                                                        field2-id (delay field2-eid)}
                                          :model/Card {card-id (delay card-eid)}})
          (is (= db-eid (:entity_id (t2/select-one :model/Database :id db-id))))
          (is (= table-eid (:entity_id (t2/select-one :model/Table :id table-id))))
          (is (= field1-eid (:entity_id (t2/select-one :model/Field :id field1-id))))
          (is (= field2-eid (:entity_id (t2/select-one :model/Field :id field2-id))))
          (is (= card-eid (:entity_id (t2/select-one :model/Card :id card-id)))))))))

(deftest ^:synchronized get-repeat-ms-test
  (testing "get-repeat-ms handles various cases appropriately"
    (setting/set! :backfill-entity-ids-repeat-ms 2000)
    (is (= 2000 (#'backfill-entity-ids/get-repeat-ms)))
    (setting/set! :backfill-entity-ids-repeat-ms 500)
    (is (= 1000 (#'backfill-entity-ids/get-repeat-ms)))
    (setting/set! :backfill-entity-ids-repeat-ms 0)
    (is (nil? (#'backfill-entity-ids/get-repeat-ms)))))
