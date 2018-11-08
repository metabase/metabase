(ns metabase.test.data.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [honeysql
             [core :as hsql]
             [format :as hformat]
             [helpers :as h]]
            [metabase.driver
             [generic-sql :as sql]
             [hive-like :as hive-like]]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx])
  (:import metabase.driver.sparksql.SparkSQLDriver))

(def ^:private field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "DOUBLE"
   :type/Integer    "INTEGER"
   :type/Text       "STRING"})

(defn- quote-name [nm]
  (str \` nm \`))

(defn- dashes->underscores [s]
  (s/replace s #"-" "_"))

(defn- qualified-name-components [& args]
  (map dashes->underscores args))

(defn- qualify+quote-name
  ([db-name]
   (dashes->underscores db-name))
  ([_ table-name]
   (dashes->underscores table-name))
  ([_ _ field-name]
   (dashes->underscores field-name)))

(defn- database->connection-details [context {:keys [database-name]}]
  (merge {:host     "localhost"
          :port     10000
          :user     "admin"
          :password "admin"}
         (when (= context :db)
           {:db (dashes->underscores database-name)})))

(defn- do-insert!
  "Insert ROWS-OR-ROWS into TABLE-NAME for the DRIVER database defined by SPEC."
  [driver spec table-name row-or-rows]
  (let [prepare-key (comp keyword (partial generic/prepare-identifier driver) name)
        rows        (if (sequential? row-or-rows)
                      row-or-rows
                      [row-or-rows])
        columns     (keys (first rows))
        values      (for [row rows]
                      (for [value (map row columns)]
                        (sqlqp/->honeysql driver value)))
        hsql-form   (-> (h/insert-into (prepare-key table-name))
                        (h/values values))
        sql+args    (hive-like/unprepare
                     (hx/unescape-dots (binding [hformat/*subquery?* false]
                                         (hsql/format hsql-form
                                                      :quoting             (sql/quote-style driver)
                                                      :allow-dashed-names? false))))]
    (with-open [conn (jdbc/get-connection spec)]
      (try
        (.setAutoCommit conn false)
        (jdbc/execute! {:connection conn} sql+args {:transaction? false})
        (catch java.sql.SQLException e
          (jdbc/print-sql-exception-chain e))))))

(defn- load-data!
  [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
  (let [spec       (generic/database->spec driver :db dbdef)
        table-name (apply hx/qualify-and-escape-dots (qualified-name-components database-name table-name))
        insert!    (generic/load-data-add-ids (partial do-insert! driver spec table-name))
        rows       (generic/load-data-get-rows driver dbdef tabledef)]
    (insert! rows)))

(defn- create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial generic/quote-name driver)
        pk-field-name (quot (generic/pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s)"
            (generic/qualify+quote-name driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (generic/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (generic/pk-sql-type driver)
            pk-field-name)))

(defn- drop-table-if-exists-sql [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (generic/qualify+quote-name driver database-name table-name)))

(defn- drop-db-if-exists-sql [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (generic/qualify+quote-name driver database-name)))

(u/strict-extend SparkSQLDriver
  generic/IGenericSQLTestExtensions
  (merge generic/DefaultsMixin
         {:add-fk-sql                (constantly nil)
          :execute-sql!              generic/sequentially-execute-sql!
          :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
          :create-table-sql          create-table-sql
          :drop-table-if-exists-sql  drop-table-if-exists-sql
          :drop-db-if-exists-sql     drop-db-if-exists-sql
          :load-data!                load-data!
          :pk-sql-type               (constantly "INT")
          :qualify+quote-name        (u/drop-first-arg qualify+quote-name)
          :qualified-name-components (u/drop-first-arg qualified-name-components)
          :quote-name                (u/drop-first-arg quote-name)})
  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details (u/drop-first-arg database->connection-details)
          :format-name                  (u/drop-first-arg dashes->underscores)
          :engine                       (constantly :sparksql)}))
