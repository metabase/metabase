(ns metabase-enterprise.dependencies.sync-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [toucan2.core :as t2]))

(defn- pending?
  "Whether the Card with `card-id` is to be re-analyzed and re-derived."
  [card-id]
  (and (deps.test/analysis-finding-pending? :card card-id)
       (deps.test/result-metadata-pending? card-id)))

(defn- record-processed!
  "Record that the analysis and result metadata jobs processed the Card with `card-id`."
  [card-id]
  (deps.test/record-analysis-finding-processed! :card card-id)
  (deps.test/record-result-metadata-processed! card-id))

(defn- with-syncable-db! [thunk]
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:dependencies}
      (one-off-dbs/with-blank-db
        (doseq [statement ["CREATE TABLE \"test_table\" (\"id\" INTEGER PRIMARY KEY, \"filter_col\" VARCHAR);"
                           "INSERT INTO \"test_table\" (\"id\", \"filter_col\") VALUES (1, 'value1'), (2, 'value2');"]]
          (jdbc/execute! one-off-dbs/*conn* [statement]))
        (sync/sync-database! (mt/db))
        (let [table-id        (t2/select-one-fn :id :model/Table :db_id (mt/id) :name "test_table")
              filter-field-id (t2/select-one-fn :id :model/Field :table_id table-id :name "filter_col")
              mp              (lib-be/application-database-metadata-provider (mt/id))
              query           (-> (lib/query mp (lib.metadata/table mp table-id))
                                  (lib/filter (lib/= (lib.metadata/field mp filter-field-id) "value1")))]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                    :database_id   (mt/id)}]
            (t2/insert! :model/Dependency {:from_entity_type :card
                                           :from_entity_id   card-id
                                           :to_entity_type   :table
                                           :to_entity_id     table-id})
            ;; NOTE: The metadata provider caches must be small here - if the cache spans a sync it will see
            ;; old values after the sync!
            (lib-be/with-metadata-provider-cache
              (deps.analysis-finding/upsert-analysis! (t2/select-one :model/Card card-id)))
            (testing "Initial analysis succeeds"
              (is (true? (t2/select-one-fn :result :model/AnalysisFinding
                                           :entity_type :card :entity_id card-id)))
              (is (empty? (deps.analysis-finding-error/errors-for-entity :card card-id))))
            (record-processed! card-id)
            (thunk {:card-id         card-id
                    :table-id        table-id
                    :filter-field-id filter-field-id})))))))

(deftest ^:synchronized sync-removed-column-triggers-reanalysis-test
  (testing "when sync deactivates a column, the cards on its table are re-analyzed and show the missing column"
    (with-syncable-db!
      (fn [{:keys [card-id filter-field-id]}]
        (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])
        (sync/sync-database! (mt/db))
        (is (false? (t2/select-one-fn :active :model/Field :id filter-field-id)))
        (is (pending? card-id))
        (deps.test/synchronously-run-dependency-job!)
        (deps.test/run-analysis-finding-job!)
        (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                      :entity_type :card :entity_id card-id)))
        (is (some #(= :missing-column (:error_type %))
                  (deps.analysis-finding-error/errors-for-entity :card card-id)))
        (is (not (deps.test/analysis-finding-pending? :card card-id)))))))

(deftest ^:synchronized scheduled-metadata-sync-triggers-reanalysis-test
  (testing "the metadata sync the scheduled sync task runs has the cards on a table it changes processed"
    (with-syncable-db!
      (fn [{:keys [card-id]}]
        (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])
        (sync/sync-db-metadata! (mt/db))
        (is (pending? card-id))))))

(deftest ^:synchronized sync-without-changes-does-not-trigger-reanalysis-test
  (testing "a sync that changes nothing about a table or its fields has nothing processed"
    (with-syncable-db!
      (fn [{:keys [card-id filter-field-id table-id]}]
        (let [table-before        (into {} (t2/select-one :model/Table :id table-id))
              filter-field-before (into {} (t2/select-one :model/Field :id filter-field-id))]
          (sync/sync-database! (mt/db))
          (is (= table-before (into {} (t2/select-one :model/Table :id table-id))))
          (is (= filter-field-before (into {} (t2/select-one :model/Field :id filter-field-id))))
          (is (not (pending? card-id)))
          (is (not (deps.test/analysis-finding-pending? :card card-id))))))))

(deftest ^:synchronized table-sync-makes-cards-on-changed-table-pending-test
  (testing "a sync of one table, like after an upload or a transform run, has the cards on it processed only when it
           changes it"
    (with-syncable-db!
      (fn [{:keys [card-id table-id]}]
        (sync/sync-table! (t2/select-one :model/Table :id table-id))
        (is (not (pending? card-id)))
        (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" ADD COLUMN \"new_col\" VARCHAR;"])
        (sync/sync-table! (t2/select-one :model/Table :id table-id))
        (is (pending? card-id))))))

(deftest ^:synchronized sync-discovered-fk-makes-cards-on-its-table-pending-test
  (testing "a foreign key a sync discovers has the cards on the table of its field processed"
    (with-syncable-db!
      (fn [{:keys [card-id]}]
        (jdbc/execute! one-off-dbs/*conn* ["CREATE TABLE \"ref_table\" (\"id\" INTEGER PRIMARY KEY, \"test_id\" INTEGER);"])
        (sync/sync-database! (mt/db))
        (let [ref-table-id (t2/select-one-fn :id :model/Table :db_id (mt/id) :name "ref_table")
              ref-field-id (t2/select-one-fn :id :model/Field :table_id ref-table-id :name "test_id")]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                         :to_entity_type   :table :to_entity_id ref-table-id})
          (record-processed! card-id)
          (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"ref_table\" ADD FOREIGN KEY (\"test_id\") REFERENCES \"test_table\"(\"id\");"])
          (sync/sync-database! (mt/db))
          (is (some? (t2/select-one-fn :fk_target_field_id :model/Field :id ref-field-id)))
          (is (pending? card-id)))))))
