(ns metabase.test.data.snowflake
  (:require [clojure.string :as s]
            [metabase.driver.generic-sql :as sql]
            [metabase.util
             [honeysql-extensions :as hx]]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.snowflake.SnowflakeDriver))


(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMPLTZ"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/Text       "TEXT"
   :type/Time       "TIME"})

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:account                        (i/db-test-env-var-or-throw :snowflake :account)
          :user                           (i/db-test-env-var-or-throw :snowflake :user)
          :password                       (i/db-test-env-var-or-throw :snowflake :password)
          :warehouse                      (i/db-test-env-var-or-throw :snowflake :warehouse)
          :QUOTED_IDENTIFIERS_IGNORE_CASE true}
         (when (= context :db)
           {:db database-name})))


(def schema-name "public")

;; Snowflake requires you identify an object with db-name.schema-name.table-name
(defn qualified-name-components
  ([_ db-or-schema-name]             [db-or-schema-name])
  ([_ db-name table-name]            [db-name schema-name table-name])
  ([_ db-name table-name field-name] [db-name schema-name table-name field-name]))


(defn- create-db-sql [driver {:keys [database-name]}]
  (let [db (generic/qualify+quote-name driver database-name)
        schema-name (generic/qualify+quote-name driver schema-name)]
    (format "CREATE DATABASE %s; USE DATABASE %s;" db db)))

(u/strict-extend SnowflakeDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :create-db-sql             create-db-sql
          :execute-sql!              generic/sequentially-execute-sql!
          :pk-sql-type               (constantly "INTEGER AUTOINCREMENT")
          :qualified-name-components qualified-name-components})

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :format-name                  (u/drop-first-arg s/upper-case)
          :default-schema               (constantly "public")
          :engine                       (constantly :snowflake)}))
