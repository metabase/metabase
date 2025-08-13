(ns metabase-enterprise.semantic-search.migration-test
  (:require
   #_[honey.sql :as sql]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [environ.core :refer [env]]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.semantic-search.db.connection :as semantic.db.connection]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.migration :as semantic.db.migration]
   [metabase-enterprise.semantic-search.db.migration.impl :as semantic.db.migration.impl]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]
   [next.jdbc :as jdbc])
  (:import (com.mchange.v2.c3p0 PooledDataSource)))

;; TODO: fixture?

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
(deftest versions-test
  (with-test-db "my_test_db"
    (with-redefs [semantic.db.migration.impl/migrate! (constantly nil)]
      (letfn [(migrate-and-get-db-version
                [attempted-version]
                (with-redefs [semantic.db.migration.impl/code-version attempted-version]
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

;; TODO: Should ensure this will run also in CI
#_(deftest tables-populated-test
  ;; ENSURE SOME MODEL, ENSURE DOCUMENTS (eg. 5 example documents), ENSURE
    (when (and (= "openai" (semantic.settings/ee-embedding-provider))
               (str/starts-with? (semantic.settings/ee-embedding-model) "text-embedding-3")
               (string? (not-empty (semantic.settings/openai-api-key)))))
    (with-test-db "my_test_db"
    ;; TODO: Ensure that no other documents are present in the appdb for indexing?
      (semantic.tu/with-indexable-documents!
        (semantic.core/init! (search.ingestion/searchable-documents) nil))))

(deftest simmultaneous-migration-attempt-test
  (with-test-db "my_test_db"))