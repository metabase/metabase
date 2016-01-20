(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [environ.core :refer [env]]
            (metabase.driver [generic-sql :as sql]
                             sqlserver)
            (metabase.test.data [datasets :as datasets]
                                [generic-sql :as generic]
                                [interface :as i]))
  (:import metabase.driver.sqlserver.SQLServerDriver))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "BIGINT"
   :BooleanField    "BIT"
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "DATETIME"
   :DecimalField    "DECIMAL"
   :FloatField      "FLOAT"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"})

(def ^:private db-name-counter
  "We destroy and create the same temporary databases serveral times when running our query processor tests.

   To kick other users off of the database when we destroy it, we `ALTER DATABASE SET SINGLE_USER ROLLBACK IMMEDIATE`.
   This has the side effect of preventing any other connections to the database. If our tests barf for any reason,
   we're left with a database that can't be connected to until the hanging connection gets killed at some indeterminate point in the future.
   In other cases, JDBC will attempt to reuse connections to the same database, which fail once it it's in SINGLE_USER mode.

   To prevent our tests from failing for silly reasons, we'll instead generate database names like `sad-toucan-incidents_100`. We'll pick
   a random number to start with, and for each subsequent database we create during the test run we'll increment this counter. Thus,
   we'll create `sad-toucan-incidents_101`, then `tupac-sightings_102`, and so forth."
  (atom (rand-int 10000)))

(defn- +suffix [db-name]
  (str db-name \_ @db-name-counter))

(defn- get-db-env-var
  "Since we run our tests on non-Windows machines, we need to connect to a remote server for running tests.
   Look up the relevant env var or throw an exception if it's not set.

     (get-db-env-var :user) ; Look up `MB_SQL_SERVER_USER`"
  [env-var & [default]]
  (or (env (keyword (format "mb-sql-server-%s" (name env-var))))
      default
      (throw (Exception. (format "In order to test SQL Server, you must specify the env var MB_SQL_SERVER_%s."
                                 (s/upper-case (name env-var)))))))

(defn- database->connection-details [_ context {:keys [database-name short-lived?]}]
  {:host         (get-db-env-var :host)
   :port         (Integer/parseInt (get-db-env-var :port "1433"))
   :user         (get-db-env-var :user)
   :password     (get-db-env-var :password)
   :db           (when (= context :db)
                   (+suffix database-name))
   :short-lived? short-lived?})


(defn- drop-db-if-exists-sql [_ {:keys [database-name]}]
  ;; Kill all open connections to the DB & drop it
  (apply format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s')
                 BEGIN
                     ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE \"%s\";
                 END;"
         (repeat 3 (+suffix database-name))))

(defn- drop-table-if-exists-sql [_ {:keys [database-name]} {:keys [table-name]}]
  (let [db-name (+suffix database-name)]
    (format "IF object_id('%s.dbo.%s') IS NOT NULL DROP TABLE \"%s\".dbo.\"%s\";" db-name table-name db-name table-name)))

(defn- qualified-name-components
  ([_ db-name]
   [(+suffix db-name)])
  ([_ db-name table-name]
   [(+suffix db-name) "dbo" table-name])
  ([_ db-name table-name field-name]
   [(+suffix db-name) "dbo" table-name field-name]))


(extend SQLServerDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:drop-db-if-exists-sql     drop-db-if-exists-sql
          :drop-table-if-exists-sql  drop-table-if-exists-sql
          :field-base-type->sql-type (fn [_ base-type] (field-base-type->sql-type base-type))
          :pk-sql-type               (constantly "INT IDENTITY(1,1)")
          :qualified-name-components qualified-name-components})
  i/IDatasetLoader
  (let [{:keys [create-db!], :as mixin} generic/IDatasetLoaderMixin]
    (merge mixin
           {:create-db!                   (fn [this dbdef]
                                            (swap! db-name-counter inc)
                                            (create-db! this dbdef))
            :database->connection-details database->connection-details
            :default-schema               (constantly "dbo")
            :engine                       (constantly :sqlserver)
            :sum-field-type               (constantly :IntegerField)})))


(defn- cleanup-leftover-dbs
  "Clean up any leftover DBs that weren't destroyed by the last test run (eg, if it failed for some reason).
   This is important because we're limited to a quota of 30 DBs on RDS."
  {:expectations-options :before-run}
  []
  (datasets/when-testing-engine :sqlserver
    (let [connection-spec (sql/connection-details->spec (SQLServerDriver.) (database->connection-details nil :server nil))
          leftover-dbs    (mapv :name (jdbc/query connection-spec "SELECT name
                                                                   FROM   master.dbo.sysdatabases
                                                                   WHERE  name NOT IN ('tempdb', 'master', 'model', 'msdb', 'rdsadmin');"))]
      (with-redefs [+suffix identity]
        (doseq [db leftover-dbs]
          (try
            (println (format "Deleting leftover SQL Server DB '%s'..." db))
            ;; (jdbc/execute! connection-spec [(drop-db-if-exists-sql nil {:database-name db})])
            ;; Don't try to kill other connections to this DB with SET SINGLE_USER -- some other instance (eg CI) might be using it
            (jdbc/execute! connection-spec [(format "DROP DATABASE \"%s\";" db)])
            (println "[ok]")
            (catch Throwable _)))))))
