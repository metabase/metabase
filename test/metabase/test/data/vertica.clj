(ns metabase.test.data.vertica
  "Code for creating / destroying a Vertica database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            (metabase.driver [generic-sql :as sql]
                             vertica)
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
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
   :type/Time       "TIME"
   :type/UUID       "VARCHAR(254)"})


(defn- database->connection-details [context {:keys [database-name short-lived?]}]
  (merge {:host         "localhost"
          :db           "myVertica"
          :port         5433
          :timezone     :America/Los_Angeles
          :short-lived? short-lived?
          :user "dbadmin"}
         (when (env :circleci)
           {:user "ubuntu"})))

(defn- qualified-name-components
  ([_]                             ["myVertica"])
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
          :pk-sql-type               (constantly "AUTO_INCREMENT")
          :qualified-name-components (u/drop-first-arg qualified-name-components)
          :execute-sql!              generic/sequentially-execute-sql!})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :default-schema               (constantly "public")
          :engine                       (constantly :vertica)
          ;; TODO: this is suspect, but it works
          :has-questionable-timezone-support? (constantly true)}))
