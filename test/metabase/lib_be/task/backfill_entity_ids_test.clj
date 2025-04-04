(ns metabase.lib-be.task.backfill-entity-ids-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.task.backfill-entity-ids :as backfill-entity-ids]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]))

(defn with-sample-data!
  "Run f in a context where a specific set of 5 rows exist in the application db and every row for a given model that
  isn't in that sample data has been added to failed-rows."
  [_model f]
  (mt/with-temp
    [:model/Database {db-id :id :as db} {}
     :model/Table {table-id :id :as table} {}
     :model/Field {field1-id :id :as field1} {}
     :model/Field {field2-id :id :as field2} {}
     :model/Field {field3-id :id :as field3} {:entity_id "an entity id_________"}]
    (reset! serdes/entity-id-cache {})
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

(deftest ^:synchronized backfill-databases-test
  (testing "Can backfill databases"
    (with-sample-data! :model/Database
      (fn [{:keys [db-id table-id field1-id]}]
        (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Database)
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Database db-id]))))
        (is (not (contains? (:model/Table @serdes/entity-id-cache) table-id)))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field1-id)))))))

(deftest ^:synchronized backfill-tables-test
  (testing "Can backfill tables"
    (with-sample-data! :model/Table
      (fn [{:keys [db-id table-id field1-id]}]
        (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Table)
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Table table-id]))))
        (is (not (contains? (:model/Database @serdes/entity-id-cache) db-id)))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field1-id)))))))

(deftest ^:synchronized backfill-fields-test
  (testing "Can backfill fields"
    (with-sample-data! :model/Field
      (fn [{:keys [db-id table-id field1-id field2-id field3-id]}]
        (binding [backfill-entity-ids/*backfill-batch-size* 5000]
          (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Field))
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Field field1-id]))))
        (is (not (nil? @(get-in @serdes/entity-id-cache [:model/Field field2-id]))))
        (is (not (contains? (:model/Field @serdes/entity-id-cache) field3-id)))
        (is (not (contains? (:model/Database @serdes/entity-id-cache) db-id)))
        (is (not (contains? (:model/Table @serdes/entity-id-cache) table-id)))))))

(deftest ^:synchonized backfill-duplicates-test
  (testing "Can backfill duplicate entities"
    (with-sample-data! :model/Database
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
  (testing "Can backfill duplicate entities"
    (binding [serdes/*retry-batch-size* 3]
      (with-sample-data! :model/Database
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

#_(deftest ^:synchronized backfill-ignores-failed-rows-test
    ;; Technically, this test is a bit redundant, since we are relying on this functionality to make other tests work,
    ;; but explicitly testing it is nice
    (testing "Doesn't backfill failed rows"
      (with-sample-data! :model/Field
        (fn [{:keys [field1-id field2-id field3-id]}]
          (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
          (is (not (nil? (:entity_id (t2/select-one :model/Field :id field1-id)))))
          (is (nil? (:entity_id (t2/select-one :model/Field :id field2-id))))
          (is (=? {:entity_id "an entity id_________"}
                  (t2/select-one :model/Field :id field3-id)))))))

#_(deftest ^:synchronized backfill-adds-failures-to-failed-rows-test
    (testing "Adds t2/update! failures to failed rows"
      (with-sample-data! :model/Field
        (fn [{:keys [field1-id field2-id]}]
          (with-redefs [t2/update! (fn [& _] (throw (Exception. "an exception")))]
            (#'backfill-entity-ids/backfill-entity-ids!-inner :model/Field)
            ;; #'failed-rows is a var containing an atom, @#'failed-rows is the atom, and @@#'failed-rows is the
            ;; #contents of that atom
            (is (nil? (:entity_id (t2/select-one :model/Field :id field1-id))))

            (is (nil? (:entity_id (t2/select-one :model/Field :id field2-id)))))))))

(deftest ^:synchronized get-repeat-ms-test
  (testing "get-repeat-ms handles various cases appropriately"
    (setting/set! :backfill-entity-ids-repeat-ms 2000)
    (is (= 2000 (#'backfill-entity-ids/get-repeat-ms)))
    (setting/set! :backfill-entity-ids-repeat-ms 500)
    (is (= 1000 (#'backfill-entity-ids/get-repeat-ms)))
    (setting/set! :backfill-entity-ids-repeat-ms 0)
    (is (nil? (#'backfill-entity-ids/get-repeat-ms)))))
