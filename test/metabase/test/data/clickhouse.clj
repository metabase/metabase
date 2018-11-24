(ns metabase.test.data.clickhouse
  "Code for creating / destroying a ClickHouse database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [environ.core :refer [env]]
            [honeysql.core :as hsql]
            [metabase.driver.clickhouse]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.driver.generic-sql.query-processor :as sqlqp])
  (:import metabase.driver.clickhouse.ClickHouseDriver java.sql.SQLException))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "Int64"
   :type/Boolean    "UInt8"
   :type/Char       "String"
   :type/Date       "DateTime"
   :type/DateTime   "DateTime"
   :type/Float      "Float64"
   :type/Integer    "Nullable(Int32)" ;; currently only needed for PK
   :type/Text       "String"
   :type/Time       "DateTime"
   :type/UUID       "UUID"})

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:host     "localhost"
          :port     8123
          :timezone :America/Los_Angeles}
         (when (env :circleci)
           {:user "ubuntu"})
         (when (= context :db)
           {:dbname database-name})))

(defn- quote-name [_ nm]
  (str \` nm \`))

(defn- test-engine [] "Memory")

(defn- qualified-name-components
  ([db-name]                       [db-name])
  ([db-name table-name]            [db-name table-name])
  ([db-name table-name field-name] [db-name table-name field-name]))

(defn- create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial quote-name driver)
        pk-field-name (quot (generic/pk-field-name driver))]
    (format "CREATE TABLE %s (%s %s, %s) ENGINE = %s"
            (generic/qualify+quote-name driver table-name)
            pk-field-name
            (generic/pk-sql-type driver)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (field-base-type->sql-type base-type)))))
                 (interpose ", ")
                 (apply str))
            (test-engine))))

(u/strict-extend ClickHouseDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:add-fk-sql                (constantly nil)
          :create-table-sql          create-table-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                generic/load-data-chunked-parallel!
          :execute-sql!              generic/sequentially-execute-sql!
          :qualified-name-components (u/drop-first-arg qualified-name-components)
          :quote-name                quote-name
          :pk-sql-type               (constantly "UInt32")})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details       (u/drop-first-arg database->connection-details)
          :engine                             (constantly :clickhouse)
          :has-questionable-timezone-support? (constantly false)}))
