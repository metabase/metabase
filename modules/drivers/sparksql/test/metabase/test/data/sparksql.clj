(ns metabase.test.data.sparksql
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [honeysql
             [core :as hsql]
             [format :as hformat]
             [helpers :as h]]
            [metabase.driver.hive-like :as hive-like]
            [metabase.driver.sql
             [query-processor :as sql.qp]
             [util :as sql.u]]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]
             [spec :as spec]]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))

(sql-jdbc.tx/add-test-extensions! :sparksql)

(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Boolean]    [_ _] "BOOLEAN")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/DateTime]   [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Float]      [_ _] "DOUBLE")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Text]       [_ _] "STRING")

;; If someone tries to run Time column tests with SparkSQL give them a heads up that SparkSQL does not support it
(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Time] [_ _]
  (throw (UnsupportedOperationException. "SparkSQL does not have a TIME data type.")))

(defmethod tx/format-name :sparksql
  [_ s]
  (s/replace s #"-" "_"))

(defmethod sql.tx/qualified-name-components :sparksql
  [driver & args]
  [(tx/format-name driver (u/keyword->qualified-name (last args)))])

(defmethod tx/dbdef->connection-details :sparksql
  [driver context {:keys [database-name]}]
  (merge
   {:host     "localhost"
    :port     10000
    :user     "admin"
    :password "admin"}
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
    (format "CREATE TABLE %s (%s, %s %s)"
            (sql.tx/qualify-and-quote driver database-name table-name)
            (->> field-definitions
                 (map (fn [{:keys [field-name base-type]}]
                        (format "%s %s" (quote-name field-name) (if (map? base-type)
                                                                  (:native base-type)
                                                                  (sql.tx/field-base-type->sql-type driver base-type)))))
                 (interpose ", ")
                 (apply str))
            pk-field-name (sql.tx/pk-sql-type driver)
            pk-field-name)))

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
