(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]))

(sql-jdbc.tx/add-test-extensions! :sqlserver)

(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Boolean]    [_ _] "BIT")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/DateTime]   [_ _] "DATETIME")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Float]      [_ _] "FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Integer]    [_ _] "INTEGER")
;; TEXT is considered deprecated -- see https://msdn.microsoft.com/en-us/library/ms187993.aspx
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Text]       [_ _] "VARCHAR(254)")
(defmethod sql.tx/field-base-type->sql-type [:sqlserver :type/Time]       [_ _] "TIME")

(defmethod tx/dbdef->connection-details :sqlserver [_ context {:keys [database-name]}]
  {:host     (tx/db-test-env-var-or-throw :sqlserver :host)
   :port     (Integer/parseInt (tx/db-test-env-var-or-throw :sqlserver :port "1433"))
   :user     (tx/db-test-env-var-or-throw :sqlserver :user)
   :password (tx/db-test-env-var-or-throw :sqlserver :password)
   :db       (when (= context :db)
               database-name)})

(defmethod sql.tx/drop-db-if-exists-sql :sqlserver [_ {:keys [database-name]}]
  ;; Kill all open connections to the DB & drop it
  (apply format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s')
                 BEGIN
                     ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE \"%s\";
                 END;"
         (repeat 3 database-name)))

(defmethod sql.tx/drop-table-if-exists-sql :sqlserver [_ {:keys [database-name]} {:keys [table-name]}]
  (let [db-name database-name]
    (format "IF object_id('%s.dbo.%s') IS NOT NULL DROP TABLE \"%s\".dbo.\"%s\";" db-name table-name db-name table-name)))

(defn- server-spec []
  (sql-jdbc.conn/connection-details->spec :sqlserver
    (tx/dbdef->connection-details :sqlserver :server nil)))

(defn- database-exists? [database-name]
  (seq (jdbc/query (server-spec) (format "SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s'" database-name))))

;; skip recreating the DB if it already exists
(defmethod tx/create-db! :sqlserver [driver {:keys [database-name], :as db-def} & options]
  (if (database-exists? database-name)
    (printf "SQL Server database '%s' already exists.\n" database-name)
    (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))

(defmethod sql.tx/qualified-name-components :sqlserver
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name "dbo" table-name])
  ([_ db-name table-name field-name] [db-name "dbo" table-name field-name]))

(defmethod sql.tx/pk-sql-type :sqlserver [_] "INT IDENTITY(1,1)")
