(ns metabase.test.data.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            [environ.core :refer [env]]
            (metabase.driver [generic-sql :as sql]
                             [hive :as hive-driver])
            (metabase.test.data [generic-sql :as generic]
                                [interface :as i])
            [metabase.util :as u]
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h])
            [metabase.util.honeysql-extensions :as hx])
  (:import metabase.driver.sparksql.SparkSQLDriver))

(def ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOLEAN"
   :type/Date       "DATE"
   :type/DateTime   "TIMESTAMP"
   :type/Decimal    "DECIMAL"
   :type/Float      "DOUBLE"
   :type/Integer    "INTEGER"
   :type/Text       "STRING"})

(defn database->connection-details [context {:keys [database-name]}]
  (merge {:host "localhost"
          :port 10000
          :db "default"
          :user "admin"
          :password "admin"}))

(defn spark-quote-name [nm]
  (str \` nm \`))

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
                        (sql/prepare-value driver {:value value})))
        hsql-form   (-> (h/insert-into (prepare-key table-name))
                        (h/values values))
        sql+args    (hive-driver/unprepare
                     (hx/unescape-dots (binding [hformat/*subquery?* false]
                                         (hsql/format hsql-form
                                                      :quoting             (sql/quote-style driver)
                                                      :allow-dashed-names? false))))]
    (with-open [conn (jdbc/get-connection spec)]
      (try
        (do
          (.setAutoCommit conn false)
          (jdbc/execute! {:connection conn} sql+args {:transaction? false}))
        (catch java.sql.SQLException e
          (println (u/format-color 'red "(sparksql) INSERT FAILED: \n%s\n" sql+args))
          (jdbc/print-sql-exception-chain e))))))

(defn make-load-data-fn
  "Create a `load-data!` function. This creates a function to actually insert a row or rows, wraps it with any WRAP-INSERT-FNS,
   the calls the resulting function with the rows to insert."
  [& wrap-insert-fns]
  (fn [driver {:keys [database-name], :as dbdef} {:keys [table-name], :as tabledef}]
    (let [spec       (generic/database->spec driver :db dbdef)
          table-name (apply hx/qualify-and-escape-dots (generic/qualified-name-components driver database-name (str database-name "_" table-name)))
          insert!    ((apply comp wrap-insert-fns) (partial do-insert! driver spec table-name))
          rows       (generic/load-data-get-rows driver dbdef tabledef)]
      (insert! rows))))

(defn create-table-sql [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quot          (partial generic/quote-name driver)
        pk-field-name (quot (generic/pk-field-name driver))]
    (format "CREATE TABLE %s (%s, %s %s);"
            (str "`" database-name "_" table-name "`")
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quot field-name) (if (map? base-type)
                                                            (:native base-type)
                                                            (generic/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (generic/pk-sql-type driver)
            pk-field-name)))

(defn drop-table-if-exists-sql [{:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (str "`" database-name "_" table-name "`")))

(u/strict-extend SparkSQLDriver
                 generic/IGenericSQLDatasetLoader
                 (merge generic/DefaultsMixin
                        {:add-fk-sql                (constantly nil)
                         :execute-sql!              generic/sequentially-execute-sql!
                         :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
                         :create-table-sql          create-table-sql
                         :drop-table-if-exists-sql  (u/drop-first-arg drop-table-if-exists-sql)
                         :create-db-sql             (constantly nil)
                         :drop-db-if-exists-sql     (constantly nil)

                         :load-data!                (make-load-data-fn generic/load-data-add-ids)
                         :pk-sql-type               (constantly "INT")
                         :quote-name                (u/drop-first-arg spark-quote-name)})
                 i/IDatasetLoader
                 (merge generic/IDatasetLoaderMixin
                        {:database->connection-details (u/drop-first-arg database->connection-details)
                         :default-schema               (constantly nil)
                         :engine                       (constantly :sparksql)}))
