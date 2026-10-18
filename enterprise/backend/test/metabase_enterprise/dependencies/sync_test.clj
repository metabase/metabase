(ns metabase-enterprise.dependencies.sync-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [toucan2.core :as t2]))

(defn- pending?
  "Whether the dependents of the Table with `table-id` are to be re-analyzed and re-derived."
  [table-id]
  (and (deps.test/dependents-pending? :model/AnalysisFindingStatus :table table-id)
       (deps.test/result-metadata-pending? :table table-id)))

(defn- record-table-versions!
  "Record that the dependents of the Table with `table-id` were re-analyzed and re-derived from its current version."
  [table-id]
  (deps.test/record-current-version! :model/AnalysisFindingStatus :table table-id)
  (deps.test/record-current-version! :model/ResultMetadataStatus :table table-id))

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
                                           :analyzed_entity_type :card :analyzed_entity_id card-id)))
              (is (empty? (deps.analysis-finding-error/errors-for-entity :card card-id))))
            (record-table-versions! table-id)
            (thunk {:card-id         card-id
                    :table-id        table-id
                    :filter-field-id filter-field-id})))))))

(deftest ^:synchronized sync-removed-column-triggers-reanalysis-test
  (testing "when sync deactivates a column, the cards on its table are re-analyzed and show the missing column"
    (with-syncable-db!
      (fn [{:keys [card-id filter-field-id table-id]}]
        (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])
        (sync/sync-database! (mt/db))
        (is (false? (t2/select-one-fn :active :model/Field :id filter-field-id)))
        (is (pending? table-id))
        (#'task.analysis-finding/check-entities!)
        (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                      :analyzed_entity_type :card :analyzed_entity_id card-id)))
        (is (some #(= :missing-column (:error_type %))
                  (deps.analysis-finding-error/errors-for-entity :card card-id)))
        (is (not (deps.test/dependents-pending? :model/AnalysisFindingStatus :table table-id)))))))

(deftest ^:synchronized scheduled-metadata-sync-triggers-reanalysis-test
  (testing "the metadata sync the scheduled sync task runs changes the version of a table it changes"
    (with-syncable-db!
      (fn [{:keys [table-id]}]
        (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])
        (sync/sync-db-metadata! (mt/db))
        (is (pending? table-id))))))

(deftest ^:synchronized sync-without-changes-does-not-trigger-reanalysis-test
  (testing "a sync that changes nothing about a table or its fields leaves its version"
    (with-syncable-db!
      (fn [{:keys [filter-field-id table-id]}]
        (let [table-before        (into {} (t2/select-one :model/Table :id table-id))
              filter-field-before (into {} (t2/select-one :model/Field :id filter-field-id))]
          (sync/sync-database! (mt/db))
          (is (= table-before (into {} (t2/select-one :model/Table :id table-id))))
          (is (= filter-field-before (into {} (t2/select-one :model/Field :id filter-field-id))))
          (is (not (deps.test/dependents-pending? :model/AnalysisFindingStatus :table table-id)))
          (is (not (deps.test/result-metadata-pending? :table table-id))))))))

(deftest ^:synchronized table-sync-marks-a-changed-table-test
  (testing "a sync of one table, like after an upload or a transform run, changes its version only when it changes it"
    (with-syncable-db!
      (fn [{:keys [table-id]}]
        (sync/sync-table! (t2/select-one :model/Table :id table-id))
        (is (not (pending? table-id)))
        (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" ADD COLUMN \"new_col\" VARCHAR;"])
        (sync/sync-table! (t2/select-one :model/Table :id table-id))
        (is (pending? table-id))))))

(deftest ^:synchronized sync-discovered-fk-marks-its-table-test
  (testing "a foreign key a sync discovers changes the version of the table of its field"
    (with-syncable-db!
      (fn [{:keys [card-id]}]
        (jdbc/execute! one-off-dbs/*conn* ["CREATE TABLE \"ref_table\" (\"id\" INTEGER PRIMARY KEY, \"test_id\" INTEGER);"])
        (sync/sync-database! (mt/db))
        (let [ref-table-id (t2/select-one-fn :id :model/Table :db_id (mt/id) :name "ref_table")
              ref-field-id (t2/select-one-fn :id :model/Field :table_id ref-table-id :name "test_id")]
          (t2/insert! :model/Dependency {:from_entity_type :card :from_entity_id card-id
                                         :to_entity_type   :table :to_entity_id ref-table-id})
          (record-table-versions! ref-table-id)
          (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"ref_table\" ADD FOREIGN KEY (\"test_id\") REFERENCES \"test_table\"(\"id\");"])
          (sync/sync-database! (mt/db))
          (is (some? (t2/select-one-fn :fk_target_field_id :model/Field :id ref-field-id)))
          (is (pending? ref-table-id)))))))
