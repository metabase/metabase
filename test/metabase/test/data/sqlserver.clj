(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data
             [datasets :as datasets]
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.sqlserver.SQLServerDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BIT"
   :type/Date       "DATE"
   :type/DateTime   "DATETIME"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/Text       "VARCHAR(254)" ; TEXT is considered deprecated -- see https://msdn.microsoft.com/en-us/library/ms187993.aspx
   :type/Time       "TIME"})

(def ^:private db-name-suffix-number
  "To kick other users off of the database when we destroy it, we `ALTER DATABASE SET SINGLE_USER ROLLBACK IMMEDIATE`.
   This has the side effect of preventing any other connections to the database. If our tests barf for any reason,
   we're left with a database that can't be connected to until the hanging connection gets killed at some indeterminate point in the future.
   In other cases, JDBC will attempt to reuse connections to the same database, which fail once it it's in SINGLE_USER mode.

   To prevent our tests from failing for silly reasons, we'll instead generate database names like `sad-toucan-incidents_100`. We'll pick
   a random number here."
  (atom (rand-int 10000)))

(defn- +suffix [db-name]
  (str db-name \_ @db-name-suffix-number))

(defn- database->connection-details [context {:keys [database-name]}]
  {:host         (i/db-test-env-var-or-throw :sqlserver :host)
   :port         (Integer/parseInt (i/db-test-env-var-or-throw :sqlserver :port "1433"))
   :user         (i/db-test-env-var-or-throw :sqlserver :user)
   :password     (i/db-test-env-var-or-throw :sqlserver :password)
   :db           (when (= context :db)
                   (+suffix database-name))})


(defn- drop-db-if-exists-sql [{:keys [database-name]}]
  ;; Kill all open connections to the DB & drop it
  (apply format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s')
                 BEGIN
                     ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE \"%s\";
                 END;"
         (repeat 3 (+suffix database-name))))

(defn- drop-table-if-exists-sql [{:keys [database-name]} {:keys [table-name]}]
  (let [db-name (+suffix database-name)]
    (format "IF object_id('%s.dbo.%s') IS NOT NULL DROP TABLE \"%s\".dbo.\"%s\";" db-name table-name db-name table-name)))

(defn- qualified-name-components
  ([db-name]                       [(+suffix db-name)])
  ([db-name table-name]            [(+suffix db-name) "dbo" table-name])
  ([db-name table-name field-name] [(+suffix db-name) "dbo" table-name field-name]))


(u/strict-extend SQLServerDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:drop-db-if-exists-sql     (u/drop-first-arg drop-db-if-exists-sql)
          :drop-table-if-exists-sql  (u/drop-first-arg drop-table-if-exists-sql)
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :pk-sql-type               (constantly "INT IDENTITY(1,1)")
          :qualified-name-components (u/drop-first-arg qualified-name-components)})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :engine                       (constantly :sqlserver)}))


(defn- cleanup-leftover-dbs!
  "Clean up any leftover DBs that weren't destroyed by the last test run (eg, if it failed for some reason).
   This is important because we're limited to a quota of 30 DBs on RDS."
  {:expectations-options :before-run}
  []
  (datasets/when-testing-engine :sqlserver
    (let [connection-spec (sql/connection-details->spec (SQLServerDriver.) (database->connection-details :server nil))
          leftover-dbs    (mapv :name (jdbc/query connection-spec "SELECT name
                                                                   FROM   master.dbo.sysdatabases
                                                                   WHERE  name NOT IN ('tempdb', 'master', 'model', 'msdb', 'rdsadmin');"))]
      (with-redefs [+suffix identity]
        (doseq [db leftover-dbs]
          (u/ignore-exceptions
            (printf "Deleting leftover SQL Server DB '%s'...\n" db)
            ;; Don't try to kill other connections to this DB with SET SINGLE_USER -- some other instance (eg CI) might be using it
            (jdbc/execute! connection-spec [(format "DROP DATABASE \"%s\";" db)])
            (println "[ok]")))))))
