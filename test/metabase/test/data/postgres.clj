(ns metabase.test.data.postgres
  "Code for creating / destroying a Postgres database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i]))
  (:import metabase.driver.postgres.PostgresDriver))

(def ^:private ^:const field-base-type->sql-type
  {:BigIntegerField "BIGINT"
   :BooleanField    "BOOL"
   :CharField       "VARCHAR(254)"
   :DateField       "DATE"
   :DateTimeField   "TIMESTAMP"
   :DecimalField    "DECIMAL"
   :FloatField      "FLOAT"
   :IntegerField    "INTEGER"
   :TextField       "TEXT"
   :TimeField       "TIME"
   :UUIDField       "UUID"})

(defn- database->connection-details [_ context {:keys [database-name short-lived?]}]
  (merge {:host         "localhost"
          :port         5432
          :timezone     :America/Los_Angeles
          :short-lived? short-lived?}
         (when (env :circleci)
           {:user "ubuntu"})
         (when (= context :db)
           {:db database-name})))

(defn- drop-table-if-exists-sql [_ _ {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS \"%s\" CASCADE;" table-name))


(extend PostgresDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:drop-table-if-exists-sql  drop-table-if-exists-sql
          :pk-sql-type               (constantly "SERIAL")
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :engine                       (constantly :postgres)}))
