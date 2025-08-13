(ns metabase-enterprise.semantic-search.migration-test
  (:require
   #_[honey.sql :as sql]
   #_[metabase-enterprise.semantic-search.env :as semantic.env]
   #_[metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   #_[metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   #_[metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [environ.core :refer [env]]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.db.connection :as semantic.db.connection]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.db.migration.impl]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]
   [next.jdbc :as jdbc])
  (:import (com.mchange.v2.c3p0 PooledDataSource)))

;; TODO: fixtures?

(set! *warn-on-reflection* true)

(defn- alt-db-name-url
  [url alt-name]
  (when (string? url)
    (u/prog1 (str/replace-first url
                                #"(^\S+//\S+/)([A-Za-z0-9_-]+)($|\?.*)"
                                (str "$1" alt-name "$3"))
      (when (nil? <>) (throw (Exception. "Empty pgvector url."))))))

(defn do-with-temp-datasource
  [db-name thunk]
  (with-redefs [semantic.db.datasource/db-url (alt-db-name-url (:mb-pgvector-db-url env) db-name)
                semantic.db.datasource/data-source (atom nil)]
    (try
      ;; ensure datasource was initialized so we can close it in finally.
      (semantic.db.datasource/ensure-initialized-data-source!)
      ()
      (thunk)
      (finally
        (.close ^PooledDataSource @semantic.db.datasource/data-source)))))

(defmacro with-temp-datasource
  [db-name & body]
  `(do-with-temp-datasource ~db-name (fn [] ~@body)))

(defn do-with-test-db
  [db-name thunk]
  (with-temp-datasource "postgres"
    (try
      (jdbc/execute! (semantic.db.datasource/ensure-initialized-data-source!)
                     [(str "DROP DATABASE IF EXISTS " db-name " (FORCE)")])
      (log/fatal "creating database")
      (jdbc/execute! (semantic.db.datasource/ensure-initialized-data-source!)
                     [(str "CREATE DATABASE " db-name)])
      (log/fatal "created database")
      (catch java.sql.SQLException e
        (log/fatal "creation failed")
        (throw e))))
  (with-temp-datasource db-name
    (thunk)))

(defmacro with-test-db
  [db-name & body]
  `(do-with-test-db ~db-name (fn [] ~@body)))

;; TODO: mechanism to completely avoid any migration (init, reindex) calls during this test!
;; TODO: scheduler.pauseJob(JobKey.jobKey("myJob", "myGroup"));
(deftest migration-table-versions-test
  (with-test-db "my_test_db"
    (letfn [(migrate-and-get-db-version
              [attempted-version]
              (with-redefs [semantic.db.migration.impl/code-version attempted-version
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
                            (:messages <>))))))))

;; TODO: Should ensure this will run also in CI (env, etc.)
;; TODO: Ensure some documents? -- probably supefluous
;; TODO: Ensure search jobs are paused to avoid flaking
(deftest migration-lock-coordination-test
  ;; ENSURE SOME MODEL, ENSURE DOCUMENTS (eg. 5 example documents)
  (when (and (= "openai" (semantic.settings/ee-embedding-provider))
             (str/starts-with? (semantic.settings/ee-embedding-model) "text-embedding-3")
             (string? (not-empty (semantic.settings/openai-api-key))))
    ;; simluate other node with thread
    (testing "Migration of simultaneous init attempt is blocked"
      (with-test-db "my_test_db_xxx"
        (let [original-write-fn @#'semantic.db.migration/write-successful-migration!
              original-migrate-fn @#'semantic.db.connection/do-with-migrate-tx
              results (atom {:executed-migrations 0
                             :log []})]
          (with-redefs-fn {#'semantic.db.connection/do-with-migrate-tx
                           (fn [& args]
                             (let [tid (.getId (Thread/currentThread))]
                               ;; leaving in the timestamp for repl purposes
                               (swap! results update :log conj [tid :started (t/local-date-time)])
                               (apply original-migrate-fn args)
                               (swap! results update :log conj [tid :ended (t/local-date-time)]))
                             nil)
                           #'semantic.db.migration/write-successful-migration!
                           (fn [& args]
                             (Thread/sleep 2000)
                             (apply original-write-fn args)
                             (swap! results update :executed-migrations inc)
                             nil)}
            (fn []
              (let [;; thread 1 attempts migration on clean db
                    f1 (future
                         (swap! results assoc :tid-first (.getId (Thread/currentThread)))
                         (semantic.core/init! (eduction (take 3) (search.ingestion/searchable-documents)) nil))
                    ;; thread 2 attempts migration 
                    f2 (future
                         (swap! results assoc :tid-second (.getId (Thread/currentThread)))
                         (Thread/sleep 100)
                         (semantic.core/init! (eduction (take 3) (search.ingestion/searchable-documents)) nil))]
                ;; wait for completion
                @f1
                @f2
                (testing "Single migration performed"
                  (= 1 (:executed-migrations @results)))
                (testing "Database locks acquired in expected order"
                  (let [{:keys [tid-first tid-second]} @results]
                    (is (=? [[tid-first :started any?]
                             [tid-second :started any?]
                             [tid-first :ended any?]
                             [tid-second :ended any?]]
                            (:log @results)))))))))))))

(defn- map-contains-keys?
  [m kseq]
  (reduce #(and %1 (contains? m %2)) true kseq))

(defn- qualify
  [q xs]
  (into []
        (map (fn [x] (keyword (name q) (name x))))
        xs))

;; TODO: Ensure CI -- dynamic model
(deftest expected-db-schema-after-migration-test
  (when (and (= "openai" (semantic.settings/ee-embedding-provider))
             (str/starts-with? (semantic.settings/ee-embedding-model) "text-embedding-3")
             (string? (not-empty (semantic.settings/openai-api-key))))
    (with-test-db "my_migration_testing_db"
      (semantic.core/init! (eduction (take 3) (search.ingestion/searchable-documents)) nil)
      (testing "migration table has expected columns"
        (is (map-contains-keys?
             (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                (sql/format {:select [:*]
                                             :from [:migration]}))
             (qualify :migration [:finished_at
                                  :status
                                  :version]))))
      (testing "control table has expected columns"
        (is (map-contains-keys?
             (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                (sql/format {:select [:*]
                                             :from [:index_control]}))
             (qualify :index_control [:active_id
                                      :active_updated_at
                                      :id
                                      :version]))))
      (testing "metadata table has expected columns"
        (is  (map-contains-keys?
              (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
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
        (let [index-table-kw (->
                              (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                                 (sql/format {:select [[:im.table_name]]
                                                              :from [[:index_control :ic]]
                                                              :join [[:index_metadata :im]
                                                                     [:= :ic.active_id :im.id]]}))
                              :index_metadata/table_name keyword)]
          (is (map-contains-keys?
               (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                  (sql/format {:select [:*]
                                               :from [index-table-kw]}))
               (qualify index-table-kw [:archived
                                        :collection_id
                                        :content
                                        :created_at
                                        :creator_id
                                        :dashboardcard_count
                                        :database_id
                                        :display_type
                                        :embedding
                                        :id
                                        :last_editor_id
                                        :last_viewed_at
                                        :legacy_input
                                        :metadata
                                        :model
                                        :model_created_at
                                        :model_id
                                        :model_updated_at
                                        :name
                                        :official_collection
                                        :pinned
                                        :text_search_vector
                                        :text_search_with_native_query_vector
                                        :verified
                                        :view_count])))))
      ;; Init does not add any row into this table, hence have to check information_schema
      (testing "index table has expected columns"
        (is (= ["document" "document_hash" "gated_at" "id" "model" "model_id" "updated_at"]
               (->> (jdbc/execute! (semantic.db.datasource/ensure-initialized-data-source!)
                                   (sql/format {:select [:column_name]
                                                :from [:information_schema.columns]
                                                :where [[:= :table_name [:inline "index_gate"]]]}))
                    (map :columns/column_name)
                    sort
                    vec)))))))

(deftest dynamic-schema-migration-test
  (when (and (= "openai" (semantic.settings/ee-embedding-provider))
             (str/starts-with? (semantic.settings/ee-embedding-model) "text-embedding-3")
             (string? (not-empty (semantic.settings/openai-api-key))))
    (with-test-db "my_migration_testing_db"
      (semantic.core/init! (eduction (take 3) (search.ingestion/searchable-documents)) nil)
      ;; add column to index table
      (let [original-code-version semantic.db.migration.impl/dynamic-code-version]
        (with-redefs-fn {#'semantic.db.migration.impl/migrate-dynamic-schema!
                         (fn [tx _opts]
                           (let [table_names (->> (jdbc/execute! tx
                                                                 (sql/format {:select [:table_name]
                                                                              :from [:index_metadata]
                                                                              :where [[:< :index_version semantic.db.migration.impl/dynamic-code-version]]
                                                                              :group-by [:table_name]}))
                                                  (map :index_metadata/table_name)
                                                  set)]
                             (doseq [table_name table_names]
                               (jdbc/execute! tx (sql/format {:alter-table [table_name] :add-column [[:new_col :int]]})))
                             (jdbc/execute! tx (sql/format {:update :index_metadata
                                                            :set {:index_version semantic.db.migration.impl/dynamic-code-version}
                                                            :where [[:in :table_name table_names]]}))))
                         #'semantic.db.migration.impl/dynamic-code-version (inc original-code-version)}
          (fn []
            ;; Trigger migration by next initialization attempt
            (semantic.core/init! (eduction (take 3) (search.ingestion/searchable-documents)) nil)
            (let [#:index_metadata{:keys [index_version table_name]}
                  (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                     (sql/format
                                      {:select [:*]
                                       :from [:index_metadata]}))]
              (testing "Index metadata table ids were updated"
                (is (= index_version semantic.db.migration.impl/dynamic-code-version)))
              (testing "Index table contains new column"
                (is  (contains? (jdbc/execute-one! (semantic.db.datasource/ensure-initialized-data-source!)
                                                   (sql/format
                                                    {:select [:*]
                                                     :from [(keyword table_name)]
                                                     :limit 1}))
                                (keyword table_name "new_col")))))))))))
