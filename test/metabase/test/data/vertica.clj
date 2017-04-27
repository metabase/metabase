(ns metabase.test.data.vertica
  "Code for creating / destroying a Vertica database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            [metabase.driver.generic-sql :as sql]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.vertica.VerticaDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Char       "VARCHAR(254)"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "NUMERIC"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/Text       "VARCHAR(254)"
   :type/Time       "TIME"})


(defn- db-name []
  (or (env :mb-vertica-db)
      "docker"))

(def ^:private db-connection-details
  (delay {:host     (or (env :mb-vertica-host) "localhost")
          :db       (db-name)
          :port     5433
          :timezone :America/Los_Angeles ; why?
          :user     (or (env :mb-vertica-user) "dbadmin")
          :password (env :mb-vertica-password)}))

(defn- qualified-name-components
  ([_]                             [(db-name)])
  ([db-name table-name]            ["public" (i/db-qualified-table-name db-name table-name)])
  ([db-name table-name field-name] ["public" (i/db-qualified-table-name db-name table-name) field-name]))


(u/strict-extend VerticaDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:create-db-sql             (constantly nil)
          :drop-db-if-exists-sql     (constantly nil)
          :drop-table-if-exists-sql  generic/drop-table-if-exists-cascade-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                generic/load-data-one-at-a-time-parallel!
          :pk-sql-type               (constantly "INTEGER")
          :qualified-name-components (u/drop-first-arg qualified-name-components)
          :execute-sql!              generic/sequentially-execute-sql!})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details       (fn [& _] @db-connection-details)
          :default-schema                     (constantly "public")
          :engine                             (constantly :vertica)
          :has-questionable-timezone-support? (constantly true)}))



(defn- dbspec [& _]
  (sql/connection-details->spec (VerticaDriver.) @db-connection-details))

(defn- set-max-client-sessions!
  {:expectations-options :before-run}
  []
  ;; Close all existing sessions connected to our test DB
  (generic/query-when-testing! :vertica dbspec "SELECT CLOSE_ALL_SESSIONS();")
  ;; Increase the connection limit; the default is 5 or so which causes tests to fail when too many connections are made
  (generic/execute-when-testing! :vertica dbspec (format "ALTER DATABASE \"%s\" SET MaxClientSessions = 10000;" (db-name))))
