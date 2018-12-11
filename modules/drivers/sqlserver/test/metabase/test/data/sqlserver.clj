(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.util :as u]))

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


(defonce ^:private ^{:doc "To kick other users off of the database when we destroy it, we `ALTER DATABASE SET
  SINGLE_USER ROLLBACK IMMEDIATE`. This has the side effect of preventing any other connections to the database. If
  our tests barf for any reason, we're left with a database that can't be connected to until the hanging connection
  gets killed at some indeterminate point in the future. In other cases, JDBC will attempt to reuse connections to the
  same database, which fail once it it's in SINGLE_USER mode.

  To prevent our tests from failing for silly reasons, we'll instead generate database names like
  `sad-toucan-incidents_100`. We'll pick a random number here."}
  db-name-suffix-number
  (rand-int 10000))

(defn- +suffix [db-name]
  (str db-name \_ db-name-suffix-number))

(defmethod tx/dbdef->connection-details :sqlserver [_ context {:keys [database-name]}]
  {:host     (tx/db-test-env-var-or-throw :sqlserver :host)
   :port     (Integer/parseInt (tx/db-test-env-var-or-throw :sqlserver :port "1433"))
   :user     (tx/db-test-env-var-or-throw :sqlserver :user)
   :password (tx/db-test-env-var-or-throw :sqlserver :password)
   :db       (when (= context :db)
               (+suffix database-name))})


(defmethod sql.tx/drop-db-if-exists-sql :sqlserver [_ {:keys [database-name]}]
  ;; Kill all open connections to the DB & drop it
  (apply format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s')
                 BEGIN
                     ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE \"%s\";
                 END;"
         (repeat 3 (+suffix database-name))))

(defmethod sql.tx/drop-table-if-exists-sql :sqlserver [_ {:keys [database-name]} {:keys [table-name]}]
  (let [db-name (+suffix database-name)]
    (format "IF object_id('%s.dbo.%s') IS NOT NULL DROP TABLE \"%s\".dbo.\"%s\";" db-name table-name db-name table-name)))

(defmethod sql.tx/qualified-name-components :sqlserver
  ([_ db-name]                       [(+suffix db-name)])
  ([_ db-name table-name]            [(+suffix db-name) "dbo" table-name])
  ([_ db-name table-name field-name] [(+suffix db-name) "dbo" table-name field-name]))

(defmethod sql.tx/pk-sql-type :sqlserver [_] "INT IDENTITY(1,1)")


;; Clean up any leftover DBs that weren't destroyed by the last test run (eg, if it failed for some reason). This is
;; important because we're limited to a quota of 30 DBs on RDS.
(defmethod tx/before-run :sqlserver [_]
  (let [connection-spec (sql-jdbc.conn/connection-details->spec :sqlserver
                          (tx/dbdef->connection-details :sqlserver :server nil))
        leftover-dbs    (map :name (jdbc/query
                                    connection-spec
                                    (str "SELECT name "
                                         "FROM master.dbo.sysdatabases "
                                         "WHERE name NOT IN ('tempdb', 'master', 'model', 'msdb', 'rdsadmin');")))]
    (with-redefs [+suffix identity]
      (doseq [db leftover-dbs]
        (u/ignore-exceptions
          (printf "Deleting leftover SQL Server DB '%s'...\n" db)
          ;; Don't try to kill other connections to this DB with SET SINGLE_USER -- some other instance (eg CI) might be using it
          (jdbc/execute! connection-spec [(format "DROP DATABASE \"%s\";" db)])
          (println "[ok]"))))))
