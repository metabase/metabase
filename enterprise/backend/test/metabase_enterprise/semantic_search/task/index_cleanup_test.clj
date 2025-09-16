(ns metabase-enterprise.semantic-search.task.index-cleanup-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.repair :as repair]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.task.index-cleanup :as sut]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- create-test-index
  "Create a test index object with the given table name and embedding model."
  [table-name {:keys [provider model-name vector-dimensions]}]
  {:table-name table-name
   :version 1
   :embedding-model {:provider provider
                     :model-name model-name
                     :vector-dimensions vector-dimensions}})

(defn- insert-metadata-with-timestamps!
  "Insert an index metadata row using record-new-index-table! and then update timestamps for testing."
  [pgvector index-metadata {:keys [table-name provider model-name vector-dimensions
                                   index-created-at indexer-last-poll]
                            :or {provider "ollama"
                                 model-name "test-model"
                                 vector-dimensions 1024}}]
  (let [index (create-test-index table-name
                                 {:provider provider
                                  :model-name model-name
                                  :vector-dimensions vector-dimensions})
        index-id (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)]
    ;; Update the timestamps that we need for testing
    (when (or index-created-at indexer-last-poll)
      (jdbc/execute! pgvector
                     (-> (sql.helpers/update (keyword (:metadata-table-name index-metadata)))
                         (sql.helpers/set (cond-> {}
                                            index-created-at (assoc :index_created_at index-created-at)
                                            indexer-last-poll (assoc :indexer_last_poll indexer-last-poll)))
                         (sql.helpers/where [:= :id index-id])
                         (sql/format :quoted true))))
    index-id))

(defn- set-active-index!
  "Set the active index in the control table."
  [pgvector control-table-name index-id]
  (jdbc/execute! pgvector
                 (-> (sql.helpers/update (keyword control-table-name))
                     (sql.helpers/set {:active_id index-id
                                       :active_updated_at [:now]})
                     (sql/format :quoted true))))

(defn- create-table!
  "Create a dummy table for testing."
  [pgvector table-name]
  (jdbc/execute! pgvector [(str "CREATE TABLE " table-name " (id SERIAL PRIMARY KEY)")]))

(deftest stale-index-cleanup-test
  (mt/with-premium-features #{:semantic-search}
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          retention-hours 24
          old-time (t/minus (t/offset-date-time) (t/hours (inc retention-hours)))
          cleanup-stale-indexes! #'sut/cleanup-stale-indexes!]
      (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)]
        (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
        (testing "drops stale tables and leaves recent ones"
          (let [stale-table "index_table_stale"
                orphaned-table "index_table_orphaned"
                recent-table "index_table_recent"
                active-table "index_table_active"
                recent-time (t/minus (t/offset-date-time) (t/hours (dec retention-hours)))]
            (try
              (create-table! pgvector stale-table)
              (create-table! pgvector orphaned-table)
              (create-table! pgvector recent-table)
              (create-table! pgvector active-table)
              (insert-metadata-with-timestamps! pgvector index-metadata {:table-name stale-table
                                                                         :index-created-at old-time})
              (insert-metadata-with-timestamps! pgvector index-metadata {:table-name recent-table
                                                                         :index-created-at recent-time})
              (let [active-index-id (insert-metadata-with-timestamps! pgvector index-metadata
                                                                      {:table-name active-table
                                                                       :index-created-at old-time})]
                (set-active-index! pgvector (:control-table-name index-metadata) active-index-id))
              (is (semantic.tu/table-exists-in-db? stale-table))
              (is (semantic.tu/table-exists-in-db? orphaned-table))
              (is (semantic.tu/table-exists-in-db? recent-table))
              (is (semantic.tu/table-exists-in-db? active-table))

              ;; Run cleanup function and ensure only the stale & orphaned tables is dropped
              (with-redefs [semantic.env/get-pgvector-datasource! (constantly pgvector)
                            semantic.env/get-index-metadata (constantly index-metadata)]
                (mt/with-temporary-setting-values [semantic.settings/stale-index-retention-hours retention-hours]
                  (cleanup-stale-indexes! pgvector index-metadata)))
              (is (not (semantic.tu/table-exists-in-db? stale-table)))
              (is (not (semantic.tu/table-exists-in-db? orphaned-table)))
              (is (semantic.tu/table-exists-in-db? recent-table))
              (is (semantic.tu/table-exists-in-db? active-table))

              (finally
                (jdbc/execute! pgvector [(str "DROP TABLE IF EXISTS " recent-table)])
                (jdbc/execute! pgvector [(str "DROP TABLE IF EXISTS " stale-table)])
                (jdbc/execute! pgvector [(str "DROP TABLE IF EXISTS " orphaned-table)])
                (jdbc/execute! pgvector [(str "DROP TABLE IF EXISTS " active-table)])))))

        (testing "handles non-existent tables gracefully"
          (let [nonexistent-table "nonexistent_table"]
            (insert-metadata-with-timestamps! pgvector index-metadata
                                              {:table-name nonexistent-table
                                               :provider "ollama"
                                               :model-name "test-model"
                                               :vector-dimensions 1024
                                               :index-created-at old-time})
            (is (not (semantic.tu/table-exists-in-db? nonexistent-table)))
            (with-redefs [semantic.settings/stale-index-retention-hours (constantly retention-hours)
                          semantic.env/get-pgvector-datasource! (constantly pgvector)
                          semantic.env/get-index-metadata (constantly index-metadata)]
              (cleanup-stale-indexes! pgvector index-metadata)
              (is (not (semantic.tu/table-exists-in-db? nonexistent-table))))))))))

(deftest tombstone-cleanup-test
  (mt/with-premium-features #{:semantic-search}
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          retention-hours (semantic.settings/tombstone-retention-hours)
          old-time (t/minus (t/offset-date-time) (t/hours (inc retention-hours)))
          recent-time (t/minus (t/offset-date-time) (t/hours (dec retention-hours)))
          cleanup-old-tombstones! #'sut/cleanup-old-gate-tombstones!]
      (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)]
        (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
        (let [active-index-id (insert-metadata-with-timestamps! pgvector index-metadata
                                                                {:table-name "tombstone_cleanup_3test_index"
                                                                 :index-created-at old-time
                                                                 :indexer-last-poll old-time})]
          (set-active-index! pgvector (:control-table-name index-metadata) active-index-id))
        (let [{:keys [gate-table-name metadata-table-name]} index-metadata]
          (testing "when indexer has not run recently, skips cleanup of old tombstone records"
            (jdbc/execute! pgvector
                           (-> (sql.helpers/insert-into (keyword gate-table-name))
                               (sql.helpers/values
                                [{:id "old-tombstone-1"
                                  :model "card"
                                  :model_id "321"
                                  :updated_at old-time
                                  :gated_at old-time
                                  :document nil
                                  :document_hash nil}])
                               (sql/format :quoted true)))
            (cleanup-old-tombstones! pgvector index-metadata)

            ;; Verify no records were deleted since indexer hasn't run recently
            (let [remaining-records (jdbc/execute! pgvector
                                                   (-> (sql.helpers/select [:*])
                                                       (sql.helpers/from (keyword gate-table-name))
                                                       (sql.helpers/order-by :id)
                                                       (sql/format :quoted true))
                                                   {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                  remaining-ids (map :id remaining-records)]
              (is (contains? (set remaining-ids) "old-tombstone-1"))))

          (testing "when indexer has run recently, cleans up old tombstone records and preserves recent ones and non-tombstones"
            ;; Update metadata for active index to have recent indexer_last_poll time
            (let [active-index-metadata (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
              (jdbc/execute! pgvector
                             (-> {:update (keyword metadata-table-name)
                                  :set {:indexer_last_poll recent-time}
                                  :where [:= :id (-> active-index-metadata :metadata-row :id)]}
                                 (sql/format :quoted true))))
            (let [gate-table-name (:gate-table-name index-metadata)]
              (jdbc/execute! pgvector
                             (-> (sql.helpers/insert-into (keyword gate-table-name))
                                 (sql.helpers/values
                                  [{:id "old-tombstone-2"
                                    :model "card"
                                    :model_id "123"
                                    :updated_at old-time
                                    :gated_at old-time
                                    :document nil
                                    :document_hash nil}
                                   {:id "old-tombstone-3"
                                    :model "dashboard"
                                    :model_id "456"
                                    :updated_at old-time
                                    :gated_at old-time
                                    :document nil
                                    :document_hash nil}
                                   {:id "recent-tombstone"
                                    :model "card"
                                    :model_id "789"
                                    :updated_at recent-time
                                    :gated_at recent-time
                                    :document nil
                                    :document_hash nil}
                                   {:id "non-tombstone"
                                    :model "card"
                                    :model_id "101"
                                    :updated_at old-time
                                    :gated_at old-time
                                    :document (doto (PGobject.)
                                                (.setType "jsonb")
                                                (.setValue (json/encode {:content "some content"})))
                                    :document_hash "hash123"}])
                                 (sql/format :quoted true)))
              (cleanup-old-tombstones! pgvector index-metadata)

              ;; Verify only old tombstones were deleted after cleanup task runs
              (let [remaining-records (jdbc/execute! pgvector
                                                     (-> (sql.helpers/select [:*])
                                                         (sql.helpers/from (keyword gate-table-name))
                                                         (sql.helpers/order-by :id)
                                                         (sql/format :quoted true))
                                                     {:builder-fn jdbc.rs/as-unqualified-lower-maps})
                    remaining-ids (map :id remaining-records)]
                (is (= #{"recent-tombstone" "non-tombstone"} (set remaining-ids)))))))))))

(deftest repair-table-cleanup-test
  (mt/with-premium-features #{:semantic-search}
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          retention-hours 2
          old-time (t/minus (t/instant) (t/hours (inc retention-hours))) ; 3 hours ago
          recent-time (t/minus (t/instant) (t/hours 1))]                 ; 1 hour ago
      (testing "parse-repair-table-timestamp"
        (let [repair-table-name (with-redefs [t/instant (constantly old-time)]
                                  (#'repair/repair-table-name))
              parsed-time (#'sut/parse-repair-table-timestamp repair-table-name)]
          (is (= (t/truncate-to old-time :millis)
                 parsed-time))))

      (testing "orphan repair table detection and cleanup"
        (let [old-repair-table-name (with-redefs [t/instant (constantly old-time)]
                                      (#'repair/repair-table-name))
              recent-repair-table-name (with-redefs [t/instant (constantly recent-time)]
                                         (#'repair/repair-table-name))
              non-repair-table-name "regular_table_123"]
          (try
            (jdbc/execute! pgvector [(format "CREATE TABLE \"%s\" (id INT)" old-repair-table-name)])
            (jdbc/execute! pgvector [(format "CREATE TABLE \"%s\" (id INT)" recent-repair-table-name)])
            (jdbc/execute! pgvector [(format "CREATE TABLE \"%s\" (id INT)" non-repair-table-name)])

            (with-redefs [semantic.settings/repair-table-retention-hours (constantly retention-hours)]
              (let [orphan-tables (#'sut/orphan-repair-tables pgvector)]
                (is (= #{old-repair-table-name} (set orphan-tables))
                    "Only old repair table should be detected as orphan"))

              (#'sut/cleanup-orphan-repair-tables! pgvector)

              (is (not (semantic.tu/table-exists-in-db? old-repair-table-name))
                  "Old repair table should be dropped")
              (is (semantic.tu/table-exists-in-db? recent-repair-table-name)
                  "Recent repair table should still exist")
              (is (semantic.tu/table-exists-in-db? non-repair-table-name)
                  "Regular table should still exist"))
            (finally
              (jdbc/execute! pgvector [(format "DROP TABLE IF EXISTS \"%s\"" old-repair-table-name)])
              (jdbc/execute! pgvector [(format "DROP TABLE IF EXISTS \"%s\"" recent-repair-table-name)])
              (jdbc/execute! pgvector [(format "DROP TABLE IF EXISTS \"%s\"" non-repair-table-name)]))))))))
