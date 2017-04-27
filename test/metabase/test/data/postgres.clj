(ns metabase.test.data.postgres
  "Code for creating / destroying a Postgres database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.postgres.PostgresDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOL"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/IPAddress  "INET"
   :type/Text       "TEXT"
   :type/Time       "TIME"
   :type/UUID       "UUID"})

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:host     "localhost"
          :port     5432
          :timezone :America/Los_Angeles}
         (when (env :circleci)
           {:user "ubuntu"})
         (when (= context :db)
           {:db database-name})))

(defn- kill-connections-to-db-sql
  "Return a SQL `SELECT` statement that will kill all connections to a database with DATABASE-NAME."
  ^String [database-name]
  (format (str "DO $$ BEGIN\n"
               "  PERFORM pg_terminate_backend(pg_stat_activity.pid)\n"
               "  FROM pg_stat_activity\n"
               "  WHERE pid <> pg_backend_pid()\n"
               "    AND pg_stat_activity.datname = '%s';\n"
               "END $$;\n")
          (name database-name)))

(defn- drop-db-if-exists-sql [driver {:keys [database-name], :as dbdef}]
  (str (kill-connections-to-db-sql database-name)
       (generic/default-drop-db-if-exists-sql driver dbdef)))


(u/strict-extend PostgresDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:drop-db-if-exists-sql     drop-db-if-exists-sql
          :drop-table-if-exists-sql  generic/drop-table-if-exists-cascade-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                generic/load-data-all-at-once!
          :pk-sql-type               (constantly "SERIAL")})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details       (u/drop-first-arg database->connection-details)
          :default-schema                     (constantly "public")
          :engine                             (constantly :postgres)
          ;; TODO: this is suspect, but it works
          :has-questionable-timezone-support? (constantly true)}))
