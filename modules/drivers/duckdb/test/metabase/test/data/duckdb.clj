(ns metabase.test.data.duckdb
  (:require
   [clojure.java.io :as io]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-table-test :as describe-table-test]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]

   [metabase.test.data.sql.ddl :as ddl]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :duckdb)

(doseq [[feature supported?] {:upload-with-auto-pk (not config/is-test?)
                              :test/time-type false
                              ::describe-table-test/describe-materialized-view-fields false  ;; duckdb has no materialized views
                              :test/cannot-destroy-db true}]
  (defmethod driver/database-supports? [:duckdb feature] [_driver _feature _db] supported?))

(defmethod tx/bad-connection-details :duckdb
  [_driver]
  {:unknown_config "single"})

(defmethod tx/dbdef->connection-details :duckdb [_ _ {:keys [database-name]}]
  {:old_implicit_casting   true
   "temp_directory"        (format "%s.ddb.tmp" database-name)
   :database_file (format "%s.ddb" database-name)
   "custom_user_agent"     "metabase_test"
   :subname                (format "%s.ddb" database-name)})

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
  (defmethod sql.tx/field-base-type->sql-type [:duckdb base-type] [_ _] db-type))

(defmethod sql.tx/pk-sql-type :duckdb [_] "INTEGER")

(defmethod sql.tx/drop-db-if-exists-sql    :duckdb [& _] nil)
(defmethod ddl/drop-db-ddl-statements   :duckdb [& _] nil)
(defmethod sql.tx/create-db-sql         :duckdb [& _] nil)

(defmethod tx/destroy-db! :duckdb
  [_driver dbdef]
  (let [file (io/file (str (tx/escaped-database-name dbdef) ".ddb"))
        wal-file (io/file (str (tx/escaped-database-name dbdef) ".ddb.wal"))]
    (when (.exists file)
      (.delete file))
    (when (.exists wal-file)
      (.delete wal-file))))

(defmethod sql.tx/add-fk-sql            :duckdb [& _] nil)

(defmethod load-data/row-xform :duckdb
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

(defmethod tx/sorts-nil-first? :duckdb
  [_driver _base-type]
  false)

(defmethod tx/dataset-already-loaded? :duckdb
  [driver dbdef]
  ;; check and make sure the first table in the dbdef has been created.
  (let [{:keys [table-name], :as _tabledef} (first (:table-definitions dbdef))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :db dbdef))
     {:write? false}
     (fn [^java.sql.Connection conn]
       (with-open [rset (.getTables (.getMetaData conn)
                                    #_catalog        nil
                                    #_schema-pattern nil
                                    #_table-pattern  table-name
                                    #_types          (into-array String ["BASE TABLE"]))]
         ;; if the ResultSet returns anything we know the table is already loaded.
         (.next rset))))))
