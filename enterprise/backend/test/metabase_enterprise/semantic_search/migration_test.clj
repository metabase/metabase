(ns metabase-enterprise.semantic-search.migration-test
  (:require
   #_[honey.sql :as sql]
   #_[metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [environ.core :refer [env]]
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
                    ;; thread 2 attempts migration shortly
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
