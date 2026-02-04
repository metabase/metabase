(ns metabase-enterprise.semantic-search.migration-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.db.connection :as semantic.db.connection]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.db.migration.impl]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest migration-table-versions-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (letfn [(migrate-and-get-db-version
                [attempted-version]
                (with-redefs [semantic.db.migration.impl/schema-version attempted-version
                              semantic.db.migration.impl/migrate-schema! (constantly nil)]
                  (log.capture/with-log-messages-for-level [messages [metabase-enterprise.semantic-search.db.migration :info]]
                    (semantic.db.connection/with-migrate-tx [tx]
                      (semantic.db.migration/maybe-migrate! tx nil)
                      {:messages (messages)
                       :db-version (@#'semantic.db.migration/db-version tx)}))))]
        (testing "Migration up works"
          (u/prog1 (migrate-and-get-db-version 130)
            (is (= 130 (:db-version <>)))
            (is (m/find-first (comp #{"Starting migration from version -1 to 130."} :message)
                              (:messages <>)))))
        (testing "Migration down is noop"
          (u/prog1 (migrate-and-get-db-version 1)
            (is (= 130 (:db-version <>)))
            (is (m/find-first
                 (comp #{(str "Database schema version (130) is newer than "
                              "code version (1). Not performing migration.")}
                       :message)
                 (:messages <>)))))
        (testing "Migration to the same version is noop"
          (u/prog1 (migrate-and-get-db-version 130)
            (is (= 130 (:db-version <>)))
            (is (m/find-first (comp #{"Migration already performed, skipping."} :message)
                              (:messages <>)))))))))

(defn- executions-overlap?
  "Check if any two executions overlap in time. Each entry is [tid :started/:ended timestamp].
   Returns true if there's any overlap (which would indicate lock failure)."
  [log]
  (let [by-thread (group-by first log)]
    (when (= 2 (count by-thread))
      (let [[[_tid1 entries1] [_tid2 entries2]] (seq by-thread)
            get-time (fn [entries event]
                       (->> entries (filter #(= event (second %))) first last))
            start1 (get-time entries1 :started)
            end1 (get-time entries1 :ended)
            start2 (get-time entries2 :started)
            end2 (get-time entries2 :ended)]
        (when (and start1 end1 start2 end2)
          ;; Overlap occurs if one execution starts before the other ends AND vice versa
          ;; i.e., start1 < end2 AND start2 < end1
          (and (t/before? start1 end2)
               (t/before? start2 end1)))))))

(deftest migration-lock-coordination-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (testing "Database lock prevents concurrent migration execution"
        (let [original-write-fn @#'semantic.db.migration/write-successful-migration!
              original-maybe-migrate @#'semantic.db.migration/maybe-migrate!
              results (atom {:executed-migrations 0
                             :log []})]
          (with-redefs-fn {#'semantic.pgvector-api/index-documents! (constantly nil)
                           ;; Wrap maybe-migrate! to log timestamps AFTER lock is acquired
                           ;; (maybe-migrate! is called inside with-migrate-tx, after the lock)
                           #'semantic.db.migration/maybe-migrate!
                           (fn [& args]
                             (let [tid (.getId (Thread/currentThread))]
                               (swap! results update :log conj [tid :started (t/local-date-time)])
                               (try
                                 (Thread/sleep 200)
                                 (apply original-maybe-migrate args)
                                 (finally
                                   (swap! results update :log conj [tid :ended (t/local-date-time)])))))
                           #'semantic.db.migration/write-successful-migration!
                           (fn [& args]
                             (Thread/sleep 2000)
                             (apply original-write-fn args)
                             (swap! results update :executed-migrations inc)
                             nil)}
            (fn []
              (let [;; thread 1 attempts migration on clean db
                    f1 (future (semantic.core/init! (semantic.tu/mock-documents) nil))
                    ;; thread 2 attempts migration concurrently
                    f2 (future (semantic.core/init! (semantic.tu/mock-documents) nil))]
                ;; wait for completion
                @f1
                @f2
                (testing "Single migration performed"
                  (is (= 1 (:executed-migrations @results))))
                (testing "Executions do not overlap"
                  (is (not (executions-overlap? (:log @results)))
                      "Executions should not overlap - lock should serialize them"))))))))))

(defn- map-contains-keys?
  [m kseq]
  (reduce #(and %1 (contains? m %2)) true kseq))

(defn- qualify
  [q xs]
  (into []
        (map (fn [x] (keyword (name q) (name x))))
        xs))

(deftest expected-db-schema-after-migration-test
  (try
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db-defaults!
        (with-redefs [semantic.pgvector-api/index-documents! (constantly nil)]
          (semantic.core/init! (semantic.tu/mock-documents) nil)
          (testing "migration table has expected columns"
            (is (map-contains-keys?
                 (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                    (sql/format {:select [:*]
                                                 :from [:migration]}))
                 (qualify :migration [:migrated_at
                                      :status
                                      :version]))))
          (testing "control table has expected columns"
            (is (map-contains-keys?
                 (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                    (sql/format {:select [:*]
                                                 :from [:index_control]}))
                 (qualify :index_control [:active_id
                                          :active_updated_at
                                          :id
                                          :version]))))
          (testing "metadata table has expected columns"
            (is  (map-contains-keys?
                  (jdbc/execute-one! (semantic.env/get-pgvector-datasource!)
                                     (sql/format {:select [:*]
                                                  :from [:index_metadata]}))
                  (qualify :index_metadata [:id
                                            :index_created_at
                                            :index_version
                                            :indexer_last_poll
                                            :indexer_last_seen
                                            :indexer_last_seen_hash
                                            :indexer_last_seen_id
                                            :model_name
                                            :provider
                                            :table_name
                                            :vector_dimensions]))))
          (testing "index table has expected columns"
            (let [index-table (->
                               (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                                  (sql/format {:select [[:im.table_name]]
                                                               :from [[:index_control :ic]]
                                                               :join [[:index_metadata :im]
                                                                      [:= :ic.active_id :im.id]]}))
                               :index_metadata/table_name)]
              (is (=? #{"archived"
                        "collection_id"
                        "content"
                        "created_at"
                        "creator_id"
                        "dashboardcard_count"
                        "database_id"
                        "display_type"
                        "embedding"
                        "id"
                        "last_editor_id"
                        "last_viewed_at"
                        "legacy_input"
                        "metadata"
                        "model"
                        "model_created_at"
                        "model_id"
                        "model_updated_at"
                        "name"
                        "official_collection"
                        "pinned"
                        "text_search_vector"
                        "text_search_with_native_query_vector"
                        "verified"
                        "view_count"}
                      (->>  (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                                           (sql/format {:select [:column_name]
                                                        :from [:information_schema.columns]
                                                        :where [[:= :table_name [:inline index-table]]]}))
                            (map :columns/column_name)
                            set)))))
          (testing "index table has expected columns"
            (is (= ["document" "document_hash" "gated_at" "id" "model" "model_id" "updated_at"]
                   (->> (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                                       (sql/format {:select [:column_name]
                                                    :from [:information_schema.columns]
                                                    :where [[:= :table_name [:inline "index_gate"]]]}))
                        (map :columns/column_name)
                        sort
                        vec)))))))
    (catch Throwable e
      (log/fatal e)
      (throw e))))

(defn- has-column?!
  [tx table-name column-name]
  (seq (jdbc/execute-one! tx (sql/format {:select [[[:raw 1] :contains]]
                                          :from [:information_schema.columns]
                                          :where [:and
                                                  [:= :table_name [:inline table-name]]
                                                  [:= :column_name [:inline column-name]]]}))))

(deftest dynamic-schema-migration-test
  (mt/with-premium-features #{:semantic-search}
    (semantic.tu/with-test-db-defaults!
      (with-redefs [semantic.pgvector-api/index-documents! (constantly nil)]
        (semantic.core/init! (semantic.tu/mock-documents) nil)
             ;; add column to index table
        (let [original-dynamic-schema semantic.db.migration.impl/dynamic-schema-version]
          (with-redefs-fn {#'semantic.db.migration.impl/migrate-dynamic-schema!
                           (fn [tx _opts]
                             (let [table_names (->> (jdbc/execute! tx
                                                                   (sql/format {:select [:table_name]
                                                                                :from [:index_metadata]
                                                                                :where [[:< :index_version semantic.db.migration.impl/dynamic-schema-version]]
                                                                                :group-by [:table_name]}))
                                                    (map :index_metadata/table_name)
                                                    set)]
                               (doseq [table_name table_names]
                                 (when-not (has-column?! tx table_name "new_col")
                                   (jdbc/execute! tx (sql/format {:alter-table [table_name] :add-column [[:new_col :int]]}))))
                               (jdbc/execute! tx (sql/format {:update :index_metadata
                                                              :set {:index_version semantic.db.migration.impl/dynamic-schema-version}
                                                              :where [[:in :table_name table_names]]}))))
                           #'semantic.db.migration.impl/dynamic-schema-version (inc original-dynamic-schema)}
            (fn []
              ;; Trigger migration by next initialization attempt
              (semantic.core/init! (semantic.tu/mock-documents) nil)
              (let [#:index_metadata{:keys [index_version table_name]}
                    (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                       (sql/format
                                        {:select [:*]
                                         :from [:index_metadata]}))]
                (testing "Index metadata table ids were updated"
                  (is (= index_version semantic.db.migration.impl/dynamic-schema-version)))
                (testing "Index table contains new column"
                  (is (has-column?! (semantic.db.datasource/ensure-initialized-data-source!)
                                    table_name "new_col")))))))))))

(deftest schema-version-match-default-version-test
  (testing "Default schema should match dynamic schema version"
    (is (= semantic.db.migration.impl/dynamic-schema-version
           (-> (semantic.index/default-index semantic.tu/mock-embedding-model)
               :version)))))
