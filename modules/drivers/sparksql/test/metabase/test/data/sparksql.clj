(ns metabase.test.data.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql
             [query-processor :as sql.qp]
             [util :as sql.u]]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]
            [metabase.test.data.sql.ddl :as ddl]))

(sql-jdbc.tx/add-test-extensions! :sparksql)

;; during unit tests don't treat Spark SQL as having FK support
(defmethod driver/supports? [:sparksql :foreign-keys] [_ _] (not config/is-test?))

(doseq [[base-type database-type] {:type/BigInteger "BIGINT"
                                   :type/Boolean    "BOOLEAN"
                                   :type/Date       "DATE"
                                   :type/DateTime   "TIMESTAMP"
                                   :type/Decimal    "DECIMAL"
                                   :type/Float      "DOUBLE"
                                   :type/Integer    "INTEGER"
                                   :type/Text       "STRING"}]
  (defmethod sql.tx/field-base-type->sql-type [:sparksql base-type] [_ _] database-type))

;; If someone tries to run Time column tests with SparkSQL give them a heads up that SparkSQL does not support it
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Time] [_ _]
  (throw (UnsupportedOperationException. "SparkSQL does not have a TIME data type.")))

(defmethod tx/format-name :sparksql
  [_ s]
  (str/replace s #"-" "_"))

(defmethod sql.tx/qualified-name-components :sparksql
  [driver & args]
  [(tx/format-name driver (u/qualified-name (last args)))])

(defmethod tx/dbdef->connection-details :sparksql
  [driver context {:keys [database-name]}]
  (merge
   {:host     (tx/db-test-env-var-or-throw :sparksql :host "localhost")
    :port     (Integer/parseUnsignedInt (tx/db-test-env-var-or-throw :sparksql :port "10000"))
    :user     (tx/db-test-env-var-or-throw :sparksql :user "admin")
    :password (tx/db-test-env-var-or-throw :sparksql :password "admin")}
   (when (= context :db)
     {:db (tx/format-name driver database-name)})))

;; SparkSQL doesn't support specifying the columns in INSERT INTO statements, so remove it
(defmethod ddl/insert-rows-honeysql-form :sparksql
  [driver table-identifier row-or-rows]
  (let [honeysql ((get-method ddl/insert-rows-honeysql-form :sql-jdbc/test-extensions)
                  driver table-identifier row-or-rows)]
    (dissoc honeysql :columns)))

(defmethod ddl/insert-rows-ddl-statements :sparksql
  [driver table-identifier row-or-rows]
  [(unprepare/unprepare driver
     (binding [hformat/*subquery?* false]
       (hsql/format (ddl/insert-rows-honeysql-form driver table-identifier row-or-rows)
         :quoting             (sql.qp/quote-style driver)
         :allow-dashed-names? false)))])

(defmethod load-data/do-insert! :sparksql
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    (with-open [conn (jdbc/get-connection spec)]
      (try
        (.setAutoCommit conn false)
        (doseq [sql+args statements]
          (jdbc/execute! {:connection conn} sql+args {:transaction? false}))
        (catch java.sql.SQLException e
          (println "Error inserting data:" (u/pprint-to-str 'red statements))
          (jdbc/print-sql-exception-chain e)
          (throw e))))))

(defmethod load-data/load-data! :sparksql [& args]
  (apply load-data/load-data-add-ids! args))

(defmethod sql.tx/create-table-sql :sparksql
  [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions]}]
  (let [quote-name    #(sql.u/quote-name driver :field (tx/format-name driver %))
        pk-field-name (quote-name (sql.tx/pk-field-name driver))]
    (format "CREATE TABLE %s (%s %s, %s)"
            (sql.tx/qualify-and-quote driver database-name table-name)
            pk-field-name (sql.tx/pk-sql-type driver)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quote-name field-name) (if (map? base-type)
                                                                  (:native base-type)
                                                                  (sql.tx/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str)))))

(defmethod sql.tx/drop-table-if-exists-sql :sparksql
  [driver {:keys [database-name]} {:keys [table-name]}]
  (format "DROP TABLE IF EXISTS %s" (sql.tx/qualify-and-quote driver database-name table-name)))

(defmethod sql.tx/drop-db-if-exists-sql :sparksql
  [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (sql.tx/qualify-and-quote driver database-name)))

(defmethod sql.tx/add-fk-sql :sparksql [& _] nil)

(defmethod execute/execute-sql! :sparksql [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :sparksql [_] "INT")

(defmethod tx/aggregate-column-info :sparksql
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/BigInteger}))))

;; strip out the default table alias `t1` from the generated native query
(defmethod tx/count-with-field-filter-query :sparksql
  [driver table field]
  (-> ((get-method tx/count-with-field-filter-query :sql/test-extensions) driver table field)
      (update :query str/replace #"`t1` " "")))
