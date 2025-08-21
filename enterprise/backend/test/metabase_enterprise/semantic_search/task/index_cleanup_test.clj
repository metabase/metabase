(ns metabase-enterprise.semantic-search.task.index-cleanup-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.task.index-cleanup :as sut]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

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
                                   index-created-at indexer-last-seen]
                            :or {provider "ollama"
                                 model-name "test-model"
                                 vector-dimensions 1024}}]
  (let [index (create-test-index table-name
                                 {:provider provider
                                  :model-name model-name
                                  :vector-dimensions vector-dimensions})
        index-id (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)]
    ;; Update the timestamps that we need for testing
    (when (or index-created-at indexer-last-seen)
      (jdbc/execute! pgvector
                     (-> (sql.helpers/update (keyword (:metadata-table-name index-metadata)))
                         (sql.helpers/set (cond-> {}
                                            index-created-at (assoc :index_created_at index-created-at)
                                            indexer-last-seen (assoc :indexer_last_seen indexer-last-seen)))
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
    (let [pgvector semantic.tu/db
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
                                                                       :index-created-at old-time
                                                                       :indexer-last-seen old-time})]
                (set-active-index! pgvector (:control-table-name index-metadata) active-index-id))
              (is (semantic.tu/table-exists-in-db? stale-table))
              (is (semantic.tu/table-exists-in-db? orphaned-table))
              (is (semantic.tu/table-exists-in-db? recent-table))
              (is (semantic.tu/table-exists-in-db? active-table))

              ;; Run cleanup function and ensure only the stale & orphaned tables is dropped
              (with-redefs [semantic.env/get-pgvector-datasource! (constantly pgvector)
                            semantic.env/get-index-metadata (constantly index-metadata)]
                (mt/with-temporary-setting-values [semantic.settings/stale-index-retention-hours retention-hours]
                  (cleanup-stale-indexes!)))
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
                                               :index-created-at old-time
                                               :indexer-last-seen nil})
            (is (not (semantic.tu/table-exists-in-db? nonexistent-table)))
            (with-redefs [semantic.settings/stale-index-retention-hours (constantly retention-hours)
                          semantic.env/get-pgvector-datasource! (constantly pgvector)
                          semantic.env/get-index-metadata (constantly index-metadata)]
              (cleanup-stale-indexes!)
              (is (not (semantic.tu/table-exists-in-db? nonexistent-table))))))))))
