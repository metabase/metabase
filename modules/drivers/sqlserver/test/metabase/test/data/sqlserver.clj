(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]))

(sql-jdbc.tx/add-test-extensions! :sqlserver)

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BIT"
                                   :type/Date           "DATE"
                                   :type/DateTime       "DATETIME"
                                   :type/DateTimeWithTZ "DATETIMEOFFSET"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "FLOAT"
                                   :type/Integer        "INTEGER"
                                   ;; TEXT is considered deprecated -- see
                                   ;; https://msdn.microsoft.com/en-us/library/ms187993.aspx
                                   :type/Text           "VARCHAR(254)"
                                   :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:sqlserver base-type] [_ _] database-type))


(defmethod tx/dbdef->connection-details :sqlserver
  [_ context {:keys [database-name]}]
  {:host     (tx/db-test-env-var-or-throw :sqlserver :host "localhost")
   :port     (Integer/parseInt (tx/db-test-env-var-or-throw :sqlserver :port "1433"))
   :user     (tx/db-test-env-var-or-throw :sqlserver :user "SA")
   :password (tx/db-test-env-var-or-throw :sqlserver :password "P@ssw0rd")
   :db       (when (= context :db)
               database-name)})

(defmethod sql.tx/drop-db-if-exists-sql :sqlserver
  [_ {:keys [database-name]}]
  ;; Kill all open connections to the DB & drop it
  (apply format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s')
                 BEGIN
                     ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE \"%s\";
                 END;"
         (repeat 3 database-name)))

(defmethod sql.tx/drop-table-if-exists-sql :sqlserver
  [_ {:keys [database-name]} {:keys [table-name]}]
  (let [db-name database-name]
    (format "IF object_id('%s.dbo.%s') IS NOT NULL DROP TABLE \"%s\".dbo.\"%s\";" db-name table-name db-name table-name)))

(defn- server-spec []
  (sql-jdbc.conn/connection-details->spec :sqlserver
    (tx/dbdef->connection-details :sqlserver :server nil)))

(defn- database-exists? [database-name]
  (seq (jdbc/query (server-spec) (format "SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s'" database-name))))

(defmethod sql.tx/qualified-name-components :sqlserver
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name "dbo" table-name])
  ([_ db-name table-name field-name] [db-name "dbo" table-name field-name]))

(defmethod sql.tx/pk-sql-type :sqlserver [_] "INT IDENTITY(1,1)")

(defmethod tx/aggregate-column-info :sqlserver
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer}))))
