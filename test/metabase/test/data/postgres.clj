(ns metabase.test.data.postgres
  "Code for creating / destroying a Postgres database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            (metabase.driver [generic-sql :as sql]
                             postgres)
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
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

(defn- database->connection-details [context {:keys [database-name short-lived?]}]
  (merge {:host         "localhost"
          :port         5432
          :timezone     :America/Los_Angeles
          :short-lived? short-lived?}
         (when (env :circleci)
           {:user "ubuntu"})
         (when (= context :db)
           {:db database-name})))

(u/strict-extend PostgresDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:drop-table-if-exists-sql  generic/drop-table-if-exists-cascade-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                generic/load-data-all-at-once!
          :pk-sql-type               (constantly "SERIAL")})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :default-schema               (constantly "public")
          :engine                       (constantly :postgres)
          ;; TODO: this is suspect, but it works
          :has-questionable-timezone-support? (constantly true)}))

;; it's super obnoxious when testing locally to have tests fail because someone is already connected to the test-data DB (meaning we can't drop it), so close all connections to it beforehand
(defn- kill-connections-to-test-data-db!
  {:expectations-options :before-run}
  []
  (generic/query-when-testing! :postgres (fn [] (sql/connection-details->spec (PostgresDriver.) (database->connection-details :server {})))
    "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND pg_stat_activity.datname = 'test-data';"))
