(ns metabase-enterprise.dependencies.sync-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.db :as deps.db]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.hooks]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- with-syncable-db! [thunk]
  (mt/with-premium-features #{:dependencies}
    (one-off-dbs/with-blank-db
      ;; Step 1: Create a table with two columns
      (doseq [statement ["CREATE TABLE \"test_table\" (\"id\" INTEGER PRIMARY KEY, \"filter_col\" VARCHAR);"
                         "INSERT INTO \"test_table\" (\"id\", \"filter_col\") VALUES (1, 'value1'), (2, 'value2');"]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      ;; Sync the database to pick up the new table
      (sync/sync-database! (mt/db))
      (let [table-id        (t2/select-one-fn :id :model/Table :db_id (mt/id) :name "test_table")
            filter-field-id (t2/select-one-fn :id :model/Field :table_id table-id :name "filter_col")
            ;; Step 2: Create a card with a filter on filter_col
            mp              (lib-be/application-database-metadata-provider (mt/id))
            table           (lib.metadata/table mp table-id)
            filter-field    (lib.metadata/field mp filter-field-id)
            query           (-> (lib/query mp table)
                                (lib/filter (lib/= filter-field "value1")))]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                  :database_id (mt/id)}]
          ;; Create the dependency manually
          (t2/insert! :model/Dependency {:from_entity_type :card
                                         :from_entity_id card-id
                                         :to_entity_type :table
                                         :to_entity_id table-id})
          ;; Step 3: Run analysis - should succeed with no errors
          (let [card (t2/select-one :model/Card card-id)]
            ;; NOTE: The metadata provider caches must be small here - if the cache spans a sync it will see
            ;; old values after the sync!
            (lib-be/with-metadata-provider-cache
              (deps.findings/upsert-analysis! card)))
          (testing "Initial analysis succeeds"
            (is (true?
                 (t2/select-one-fn :result :model/AnalysisFinding
                                   :analyzed_entity_type :card
                                   :analyzed_entity_id card-id)))
            (is (empty? (deps.analysis-finding-error/errors-for-entity :card card-id))))
          ;; Backdate the analysis timestamp and table/field updated_at so
          ;; synced-db->direct-dependents-of-changed-tables will detect it as stale (analyzed_at < field.updated_at)
          ;; after a new sync makes an edit.
          ;; This is necessary because within a transaction, now() returns the same value, so the initial analysis and
          ;; the field update from sync would have identical timestamps.
          (let [old-time (t/minus (t/offset-date-time) (t/hours 1))]
            (t2/update! :model/AnalysisFinding
                        {:analyzed_entity_type :card :analyzed_entity_id card-id}
                        {:analyzed_at old-time})
            (t2/update! :model/Field :table_id table-id
                        {:updated_at old-time})
            (t2/update! :model/Table :id table-id
                        {:updated_at old-time}))
          ;; Setup complete: Now call the thunk for the actual test run.
          (thunk {:db-id           (:id (mt/db))
                  :card-id         card-id
                  :table-id        table-id
                  :filter-field-id filter-field-id}))))))

;; Integration test that a real DB sync triggers re-analysis of an updated table.
(deftest ^:synchronized sync-removed-column-triggers-reanalysis-test
  (testing "When sync detects a removed column, re-analyzing the card shows errors"
    (with-syncable-db!
      (fn [{:keys [card-id filter-field-id]}]
        (let [initial-analysis-time (t2/select-one-fn :analyzed_at :model/AnalysisFinding
                                                      :analyzed_entity_type :card
                                                      :analyzed_entity_id card-id)]
          ;; Step 4: Remove the column used in the filter
          (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])
          ;; Step 5: Re-sync the database. The sync-end event will detect the stale analysis
          ;; (because analyzed_at < field.updated_at) and mark it for re-analysis.
          (sync/sync-database! (mt/db))
          ;; Verify the field is now inactive
          (testing "Field is marked inactive after sync"
            (is (false? (t2/select-one-fn :active :model/Field :id filter-field-id))))
          ;; Step 6 & 7: The sync-end event marks dependents as stale and triggers the job.
          ;; Due to race conditions, the entity may be either stale (job hasn't run yet)
          ;; or already reanalyzed (job ran). Check for either valid outcome.
          (let [finding (t2/select-one :model/AnalysisFinding
                                       :analyzed_entity_type :card
                                       :analyzed_entity_id card-id)]
            (is (some? finding) "Analysis finding should exist")
            (if (:stale finding)
              ;; Job hasn't run yet - sync marked it stale, that's the expected behavior
              (testing "Entity is marked stale for re-analysis"
                (is (true? (:stale finding))))
              ;; Job already ran - verify the reanalysis detected the missing column
              (testing "Re-analysis detects the missing column"
                (is (false? (:result finding)) "Analysis should fail")
                (is (not= initial-analysis-time (:analyzed_at finding))
                    "Analysis should have been re-run")
                (let [errors (deps.analysis-finding-error/errors-for-entity :card card-id)]
                  (is (seq errors) "Should have analysis errors")
                  (is (some #(= :missing-column (:error_type %)) errors)
                      "Should have a missing-column error"))))))))))

(deftest ^:synchronized scheduled-metadata-sync-triggers-reanalysis-test
  (testing "The metadata sync the scheduled sync task runs marks the dependents of a changed table for re-analysis"
    (with-syncable-db!
      (fn [{:keys [card-id]}]
        (let [initial-analysis-time (t2/select-one-fn :analyzed_at :model/AnalysisFinding
                                                      :analyzed_entity_type :card
                                                      :analyzed_entity_id card-id)]
          (jdbc/execute! one-off-dbs/*conn* ["ALTER TABLE \"test_table\" DROP COLUMN \"filter_col\";"])
          (sync/sync-db-metadata! (mt/db))
          (let [finding (t2/select-one :model/AnalysisFinding :analyzed_entity_type :card :analyzed_entity_id card-id)]
            (is (or (:stale finding)
                    (not= initial-analysis-time (:analyzed_at finding))))))))))

;; Integration test that a DB sync which doesn't change anything about a table does not trigger re-analysis of all
;; cards which depend on that table.
(deftest ^:synchronized sync-without-changes-does-not-trigger-reanalysis-test
  (testing "When sync makes no changes to a table or its fields, the card is not re-analyzed"
    (with-syncable-db!
      (fn [{:keys [card-id db-id filter-field-id table-id]}]
        (let [initial-analysis-time (t2/select-one-fn :analyzed_at :model/AnalysisFinding
                                                      :analyzed_entity_type :card
                                                      :analyzed_entity_id card-id)
              db-deps-checked       (atom [])
              original-deps-check   (mt/original-fn #'deps.db/table-ids-with-outdated-findings)
              table-before          (into {} (t2/select-one :model/Table :id table-id))
              filter-field-before   (into {} (t2/select-one :model/Field :id filter-field-id))]
          ;; Re-sync the database, having made no changes to it.
          (mt/with-dynamic-fn-redefs [deps.db/table-ids-with-outdated-findings
                                      (fn [db-id]
                                        (u/prog1 (original-deps-check db-id)
                                          (swap! db-deps-checked conj [db-id <>])))]
            (sync/sync-database! (mt/db)))
          (testing "sync doesn't update tables or fields that haven't changed"
            (let [table-after        (into {} (t2/select-one :model/Table :id table-id))
                  filter-field-after (into {} (t2/select-one :model/Field :id filter-field-id))]
              (is (= table-before table-after))
              (is (= filter-field-before filter-field-after))))
          (testing "the DB is were checked for tables that need deps updates, but none were found"
            (is (=? [[db-id empty?]]
                    @db-deps-checked)))
          (testing "No re-analysis was done, the analysis for the card is ~1 hour ago"
            (let [finding (t2/select-one :model/AnalysisFinding
                                         :analyzed_entity_type :card
                                         :analyzed_entity_id card-id)]
              (is (some? finding) "Analysis finding should exist")
              (is (true? (:result finding)) "Analysis should be a success")
              (is (= initial-analysis-time (:analyzed_at finding))
                  "Analysis should not have been re-run"))))))))
