(ns metabase.test.data.clickhouse
  "Code for creating / destroying a ClickHouse database from a `DatabaseDefinition`."
  (:require [clojure.java.jdbc :as jdbc]
            [environ.core :refer [env]]
            metabase.driver.clickhouse
            [metabase.test.data
                         [generic-sql :as generic]
                         [interface :as i]]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.driver.generic-sql.query-processor :as sqlqp])
  (:import metabase.driver.clickhouse.ClickHouseDriver java.sql.SQLException))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "Int64"
   :type/Boolean    "UInt8"
   :type/Char       "String"
   :type/Date       "Date"
   :type/DateTime   "DateTime"
   :type/Float      "Float64"
   :type/Integer    "Int32"
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

(defn- create-table-sql [this {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot (partial quote-name this)]
    (format "CREATE TABLE %s (%s) ENGINE = %s"
            (generic/qualify+quote-name this database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (field-base-type->sql-type base-type)))))
                 (interpose ", ")
                 (apply str))
            (test-engine))))

(defn- qualified-name-components
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [table-name])
  ([_ db-name table-name field-name] [field-name]))

(defn- do-insert!
  "Insert ROW-OR-ROWS into TABLE-NAME for the DRIVER database defined by SPEC."
  [driver spec table-name row-or-rows]
  (let [rows    (if (sequential? row-or-rows) row-or-rows [row-or-rows])
        columns (keys (first rows))
        values  (for [row rows]
                  (for [value (map row columns)]
                    (sqlqp/->honeysql driver value)))]
    (try (jdbc/insert-multi! spec table-name columns values)
          (catch SQLException e
            (println (u/format-color 'red "INSERT FAILED"))
            (jdbc/print-sql-exception-chain e)))))

(defn- load-data-clickhouse!
  [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  (jdbc/with-db-connection [conn (generic/database->spec driver :db dbdef)]
    (.setAutoCommit (jdbc/get-connection conn) false)
    (let [table-name (apply hx/qualify-and-escape-dots (generic/qualified-name-components driver database-name table-name))
          insert!    (partial do-insert! driver conn table-name)
          rows       (generic/load-data-get-rows driver dbdef tabledef)]
      (insert! rows))))

(u/strict-extend ClickHouseDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:add-fk-sql                (constantly nil)
          :create-table-sql          create-table-sql
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :load-data!                load-data-clickhouse!
          :execute-sql!              generic/sequentially-execute-sql!
          :quote-name                quote-name
          :pk-field-name             (constantly nil)
          :pk-sql-type               (constantly "UInt64")
          :qualified-name-components qualified-name-components})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin

         {:database->connection-details       (u/drop-first-arg database->connection-details)
          :engine                             (constantly :clickhouse)
          :has-questionable-timezone-support? (constantly false)}))
