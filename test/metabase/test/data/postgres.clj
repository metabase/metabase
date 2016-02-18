(ns metabase.test.data.postgres
  "Code for creating / destroying a Postgres database from a `DatabaseDefinition`."
  (:require [environ.core :refer [env]]
            metabase.driver.postgres
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i]))
  (:import metabase.driver.postgres.PostgresDriver))

(def ^:private ^:const field-base-type->sql-type
  {:type/boolean              "BOOL"
   :type/datetime             "TIMESTAMP"
   :type/datetime.date        "DATE"
   :type/datetime.time        "TIME"
   :type/number.float         "FLOAT"
   :type/number.float.decimal "DECIMAL"
   :type/number.integer       "INTEGER"
   :type/number.integer.big   "BIGINT"
   :type/text                 "VARCHAR(254)"
   :type/text.uuid            "UUID"})

(defn- database->connection-details [_ context {:keys [database-name short-lived?]}]
  (merge {:host         "localhost"
          :port         5432
          :timezone     :America/Los_Angeles
          :short-lived? short-lived?}
         (when (env :circleci)
           {:user "ubuntu"})
         (when (= context :db)
           {:db database-name})))

(extend PostgresDriver
  generic/IGenericSQLDatasetLoader
  (merge generic/DefaultsMixin
         {:drop-table-if-exists-sql  generic/drop-table-if-exists-cascade-sql
          :field-base-type->sql-type (fn [_ base-type]
                                       (field-base-type->sql-type base-type))
          :load-data!                generic/load-data-all-at-once!
          :pk-sql-type               (constantly "SERIAL")})
  i/IDatasetLoader
  (merge generic/IDatasetLoaderMixin
         {:database->connection-details database->connection-details
          :default-schema               (constantly "public")
          :engine                       (constantly :postgres)}))
