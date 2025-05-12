(ns metabase.test.data.motherduck
  (:require
   [clojure.tools.logging :as log]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-table-test :as describe-table-test]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx :refer [qualify-and-quote]]
   [metabase.test.data.sql-jdbc.execute :as sql-jdbc.test-execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql-jdbc.spec  :refer [dbdef->spec]]
   [metabase.test.data.sql.ddl :as ddl]))

(set! *warn-on-reflection* true)

(doseq [[feature supported?] {:upload-with-auto-pk (not config/is-test?)
                              :test/time-type false
                              ::describe-table-test/describe-materialized-view-fields false  ;; motherduck has no materialized views
                              :test/cannot-destroy-db true}]
  (defmethod driver/database-supports? [:motherduck feature] [_driver _feature _db] supported?))

(defmethod tx/bad-connection-details :motherduck
  [_driver]
  {:unknown_config "single"})

(defmethod dbdef->spec :motherduck [driver context dbdef]
  (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver context dbdef)))

;; use this to connect to MotherDuck in workspace mode, to set up and destroy test databases.
(defn- md-workspace-mode-spec
  []
  (sql-jdbc.conn/connection-details->spec :motherduck {:old_implicit_casting   true
                                                       "custom_user_agent"     "metabase_test"
                                                       :database_file          "md:"
                                                       :subname                "md:"
                                                       :attach_mode            "workspace"}))

(defmethod tx/create-db! :motherduck
  [driver dbdef & options]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (md-workspace-mode-spec)
   {:write? true}
   (fn [^java.sql.Connection conn]
     (try (.setAutoCommit conn true)
          (catch Throwable _
            (log/debugf "`.setAutoCommit` failed with engine `%s`" (name driver))))
     (sql-jdbc.test-execute/execute-sql! driver conn (sql.tx/create-db-sql driver dbdef))))

  (apply load-data/create-db! driver dbdef options))

(defmethod tx/dbdef->connection-details :motherduck [_ _ {:keys [database-name]}]
  {:old_implicit_casting   true
   "custom_user_agent"     "metabase_test"
   :database_file         (format "md:%s" database-name)
   :subname               (format "md:%s" database-name)})

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
                             :type/UUID           "UUID"}]
  (defmethod sql.tx/field-base-type->sql-type [:motherduck base-type] [_ _] db-type))

(defmethod sql.tx/pk-sql-type :motherduck [_] "INTEGER")

(defmethod ddl/drop-db-ddl-statements   :motherduck [driver {:keys [database-name]}]
  ["ATTACH IF NOT EXISTS ':memory:' AS memdb;"
   "USE memdb;"
   (format "DROP DATABASE %s CASCADE;" (qualify-and-quote driver database-name))])

(defmethod sql.tx/create-db-sql :motherduck
  [driver {:keys [database-name]}]
  (format "CREATE DATABASE IF NOT EXISTS %s;" (qualify-and-quote driver database-name)))

(defmethod sql.tx/add-fk-sql            :motherduck [& _] nil)

(defmethod load-data/row-xform :motherduck
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod tx/sorts-nil-first? :motherduck
  [_driver _base-type]
  false)

(defmethod tx/dataset-already-loaded? :motherduck
  [driver dbdef]
  ;; check and make sure the first table in the dbdef has been created.
  (let [{:keys [table-name database-name], :as _tabledef} (first (:table-definitions dbdef))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (md-workspace-mode-spec)
     {:write? true}
     (fn [^java.sql.Connection conn]
       (sql-jdbc.test-execute/execute-sql! driver conn (sql.tx/create-db-sql driver dbdef))))

    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :db dbdef))
     {:write? false}
     (fn [^java.sql.Connection conn]
       (with-open [rset (.getTables (.getMetaData conn)
                                    #_catalog        database-name
                                    #_schema-pattern nil
                                    #_table-pattern  table-name
                                    #_types          (into-array String ["BASE TABLE"]))]
         (.next rset))))))

(defn- delete-old-databases!
  "Remove all databases from motherduck account except for the default ones. Test runs can create databases that need to be cleaned up."
  [^java.sql.Connection conn]
  (let [drop-sql (fn [db-name] (format "DROP DATABASE IF EXISTS \"%s\" CASCADE;" db-name))]
    (with-open [stmt (.createStatement conn)]
      (with-open [rset (.executeQuery stmt "select database_name from duckdb_databases() where type = 'motherduck' and database_name not in ('my_db', 'sample_data'); ")]
        (while (.next rset)
          (let [db-name (.getString rset "database_name")]
            (with-open [inner-stmt (.createStatement conn)]
              (.execute inner-stmt (drop-sql db-name)))))))))

(defmethod tx/before-run :motherduck
  [driver]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (md-workspace-mode-spec)
   {:write? true}
   delete-old-databases!))

(defmethod tx/after-run :motherduck
  [driver]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   (md-workspace-mode-spec)
   {:write? true}
   delete-old-databases!))