(ns metabase.test.data.motherduck
  "Test data extensions for the MotherDuck driver.

  Load test data through the MotherDuck Postgres endpoint with the same connection settings as
  the driver under test. Inherit the Postgres and SQL-JDBC test extensions, with overrides for DuckDB SQL and
  endpoint behavior."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.motherduck-test.util :as motherduck-test.util]
   [metabase.driver.sql-jdbc.connection-test :as connection-test]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-table-test :as describe-table-test]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   ;; Load the inherited test extensions, including the row-xform method used below.
   [metabase.test.data.postgres]
   [metabase.test.data.sql :as sql.tx :refer [qualify-and-quote]]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql-jdbc.spec :as spec]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util.random :as u.random])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

;; Postgres already inherits the SQL-JDBC test extensions. Calling add-test-extensions! again
;; for MotherDuck would fail because clojure.core/derive rejects a redundant ancestor.

(doseq [[feature supported?] {::describe-table-test/describe-materialized-view-fields false ; MotherDuck has no materialized views
                              ;; Field sync reports primary keys through information_schema even
                              ;; though foreign key sync (:metadata/key-constraints) is disabled.
                              ::describe-table-test/describe-pks true
                              :test/cannot-destroy-db true
                              ;; This pooling test invalidates the user name. The endpoint authenticates
                              ;; with the token and ignores the user name, so the connection stays valid.
                              ::connection-test/regular-connection-pooling false}]
  (defmethod driver/database-supports? [:motherduck feature] [_driver _feature _db] supported?))

;; The endpoint ignores unknown connection options. A nonexistent database reliably fails to connect.
(defmethod tx/bad-connection-details :motherduck
  [_driver]
  {:dbname (u.random/random-name)})

;; The inherited query uses public, but DuckDB's default schema is main.
(defmethod tx/agg-venues-by-category-id :motherduck
  [_driver]
  "select category_id, array_agg(name)
   from main.venues
   group by category_id
   order by 1 asc
   limit 2;")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Connection details                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Use the same endpoint and credentials for test setup and driver queries. MB_MOTHERDUCK_TEST_*
;; variables override the defaults, with MOTHERDUCK_TOKEN as the fallback password.
;;
;; The endpoint requires an existing database even for CREATE DATABASE and DROP DATABASE. Connect
;; the :server context to my_db, or MB_MOTHERDUCK_TEST_SERVER_DBNAME, so setup and cleanup can run
;; independently of the test database. Other contexts use the requested database, including nil
;; contexts from callers that supply a database-name.
(defmethod tx/dbdef->connection-details :motherduck
  [_driver context {:keys [database-name]}]
  {:host     (tx/db-test-env-var :motherduck :host "pg.us-east-1-aws.motherduck.com")
   :port     (tx/db-test-env-var :motherduck :port 5432)
   :user     (tx/db-test-env-var :motherduck :user "metabase")
   :password (or (tx/db-test-env-var :motherduck :password) (motherduck-test.util/motherduck-token))
   :ssl      true
   :dbname   (if (and database-name (not= context :server))
               database-name
               (tx/db-test-env-var :motherduck :server-dbname "my_db"))})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              DDL / type dialect                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[base-type db-type] {:type/BigInteger     "BIGINT"
                             :type/Boolean        "BOOL"
                             :type/Date           "DATE"
                             :type/DateTime       "TIMESTAMP"
                             :type/DateTimeWithTZ "TIMESTAMPTZ"
                             :type/Decimal        "DECIMAL"
                             :type/Float          "DOUBLE"
                             :type/Integer        "INTEGER"
                             :type/Text           "STRING"
                             :type/Time           "TIME"
                             ;; The endpoint reports TIMETZ as JDBC Types.TIME, so the reader returns
                             ;; LocalTime and loses the offset. Map these types to TIME so the test
                             ;; framework does not claim that the driver preserves time zone offsets.
                             :type/TimeWithTZ          "TIME"
                             :type/TimeWithLocalTZ     "TIME"
                             :type/TimeWithZoneOffset  "TIME"
                             :type/UUID           "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:motherduck base-type] [_ _] db-type))

;; DuckDB has no SERIAL type. Use INTEGER and let row-xform generate the IDs.
(defmethod sql.tx/pk-sql-type :motherduck [_] "INTEGER")

;; Qualify test tables with DuckDB's default schema rather than Postgres public.
(defmethod sql.tx/session-schema :motherduck [_driver] "main")

(defmethod sql.tx/create-db-sql :motherduck
  [driver {:keys [database-name]}]
  (format "CREATE DATABASE IF NOT EXISTS %s;" (qualify-and-quote driver database-name)))

;; The inherited method uses a Postgres DO block to terminate other connections. DuckDB does not
;; support that block. The :server connection uses a different database, so DROP can run directly.
(defmethod ddl/drop-db-ddl-statements :motherduck
  [driver {:keys [database-name]} & _]
  [(format "DROP DATABASE IF EXISTS %s CASCADE;" (qualify-and-quote driver database-name))])

;; DuckDB requires foreign keys in CREATE TABLE. The loader adds them afterward, so omit them
;; and keep :metadata/key-constraints disabled in the driver.
(defmethod sql.tx/add-fk-sql :motherduck [& _] nil)

;; DuckDB supports virtual generated columns, the default when STORED is omitted.
(defmethod sql.tx/generated-column-sql :motherduck [_ expr]
  (format "GENERATED ALWAYS AS (%s)" expr))

;; Generate IDs without SERIAL, then reuse Postgres JSON casts to give bound values an explicit type.
(defmethod load-data/row-xform :motherduck
  [driver dbdef tabledef]
  (comp (load-data/maybe-add-ids-xform tabledef)
        ((get-method load-data/row-xform :postgres) driver dbdef tabledef)))

;; Split large datasets into batches to stay below pgjdbc's 65,535-parameter limit.
(defmethod load-data/chunk-size :motherduck
  [_driver _dbdef _tabledef]
  200)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Statement execution                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The endpoint returns a result set for some statements, including SET and COMMENT ON, even in
;; Metabase compatibility mode. Use Statement.execute, which accepts result sets, instead of executeUpdate.
(defmethod execute/execute-sql! :motherduck
  [driver ^Connection conn sql]
  (execute/default-execute-sql!
   driver conn sql
   :execute! (fn [^Connection conn ^String sql]
               (with-open [stmt (.createStatement conn)]
                 (.execute stmt sql)))))

(defmethod load-data/do-insert! :motherduck
  [driver ^Connection conn table-identifier rows]
  ;; The inherited method uses executeUpdate for SET, which rejects the endpoint's result set.
  ;; Set the session time zone with execute before loading rows.
  (with-open [stmt (.createStatement conn)]
    (.execute stmt "SET SESSION TIMEZONE TO 'UTC';"))
  ;; Prevent parameter binding from looking up the database time zone before sync completes.
  (mt/with-database-timezone-id nil
    (doseq [[sql & params] (ddl/insert-rows-dml-statements driver table-identifier rows)]
      (try
        (with-open [stmt (.prepareStatement conn ^String sql)]
          (when (seq params)
            (sql-jdbc.execute/set-parameters! driver stmt params))
          (.execute stmt))
        (catch Throwable e
          (throw (ex-info (format "INSERT FAILED: %s" (ex-message e))
                          {:driver driver, :sql sql}
                          e)))))))

;; Reuse the SQL-JDBC view builders with the execution method above, which accepts result sets.
(defmethod tx/create-view-of-table! :motherduck
  [driver database view-name table-name options]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database {:write? true}
   (fn [conn]
     (execute/execute-sql! driver conn (first (sql.tx/create-view-of-table-sql driver database view-name table-name options))))))

(defmethod tx/drop-view! :motherduck
  [driver database view-name options]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database {:write? true}
   (fn [conn]
     (execute/execute-sql! driver conn (first (sql.tx/drop-view-sql driver database view-name options))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      create / load / cleanup lifecycle                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defonce ^:private ^{:doc "Names of test databases created or reused by this run. Cleanup drops only
  databases registered here, including datasets left by earlier runs."}
  created-databases
  (atom #{}))

(defmethod tx/create-db! :motherduck
  [driver dbdef & options]
  (swap! created-databases conj (:database-name dbdef))
  (apply load-data/create-db! driver dbdef options))

(defmethod tx/dataset-already-loaded? :motherduck
  [driver dbdef]
  ;; Include reused datasets in cleanup, even when create-db! does not run.
  (swap! created-databases conj (:database-name dbdef))
  (try
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (spec/dbdef->spec driver :db dbdef)
     {:write? false}
     (fn [^java.sql.Connection conn]
       ;; An existing database may be left empty by an interrupted load. Check for the first
       ;; dataset table rather than treating a successful connection as proof that data was loaded.
       (with-open [stmt (.prepareStatement conn (str "SELECT 1 FROM duckdb_tables() "
                                                     "WHERE database_name = current_database() AND table_name = ? "
                                                     "LIMIT 1"))]
         (.setString stmt 1 (:table-name (first (:table-definitions dbdef))))
         (with-open [rset (.executeQuery stmt)]
           (.next rset)))))
    (catch Throwable _
      ;; A missing database fails at connection time.
      false)))

(defmethod tx/before-run :motherduck
  [_driver]
  ;; Clear names left by an earlier run in the same JVM.
  (reset! created-databases #{}))

(defmethod tx/after-run :motherduck
  [driver]
  ;; Drop the test databases registered during this run, including reused datasets.
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (spec/dbdef->spec driver :server nil)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (doseq [db-name @created-databases]
       (with-open [stmt (.createStatement conn)]
         (.execute stmt (format "DROP DATABASE IF EXISTS \"%s\" CASCADE;" db-name))))
     (reset! created-databases #{}))))
