(ns metabase.test.data.databricks-jdbc
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :databricks-jdbc)

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BOOLEAN"
                                   :type/Date           "DATE"
                                   :type/DateTime       "TIMESTAMP"
                                   ;; TODO: Verify following is ok
                                   :type/DateTimeWithTZ "TIMESTAMP"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "DOUBLE"
                                   :type/Integer        "INTEGER"
                                   :type/Text           "STRING"}]
  (defmethod sql.tx/field-base-type->sql-type [:databricks-jdbc base-type] [_ _] database-type))

;; TODO: Naming schema vs database!
(defmethod tx/dbdef->connection-details :databricks-jdbc
  [_driver _connection-type {:keys [database-name]}]
  (merge
   {:host      (tx/db-test-env-var-or-throw :databricks-jdbc :host)
    :token     (tx/db-test-env-var-or-throw :databricks-jdbc :token)
    :http-path (tx/db-test-env-var-or-throw :databricks-jdbc :http-path)
    :catalog   (tx/db-test-env-var-or-throw :databricks-jdbc :catalog)
    :schema    database-name}))

(defn- existing-databases
  "Set of databases that already exist. Used to avoid creating those"
  []
  (sql-jdbc.execute/do-with-connection-with-options
   :databricks-jdbc
   (->> (tx/dbdef->connection-details :databricks-jdbc nil nil)
        ;; TODO: use db->pooled-connection-spec
        (sql-jdbc.conn/connection-details->spec :databricks-jdbc))
   nil
   (fn [^java.sql.Connection conn]
     (into #{} (map :databasename) (jdbc/query {:connection conn} ["SHOW DATABASES;"])))))

(comment
  (existing-databases)
  )

(defmethod tx/create-db! :athena
  [driver {:keys [schema], :as db-def} & options]
  (let [schema (ddl.i/format-name driver schema)]
    (if (contains? #_#{} (existing-databases) schema)
      (log/infof "Databricks database %s already exists, skipping creation" (pr-str schema))
      (do
        (log/infof "Creating Databricks database %s" (pr-str schema))
        (apply (get-method tx/create-db! :sql-jdbc/test-extensions) driver db-def options)))))

;; Following implementation does not attemp to .setAutoCommit, that is not supported by Databricks jdbc driver.
(defmethod load-data/do-insert! :databricks-jdbc
  [driver spec table-identifier row-or-rows]
  (let [statements (ddl/insert-rows-ddl-statements driver table-identifier row-or-rows)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     spec
     {:write? true}
     (fn [^java.sql.Connection conn]
       (try
         (doseq [sql+args statements]
           (jdbc/execute! {:connection conn} sql+args {:transaction? false}))
         (catch java.sql.SQLException e
                (log/infof "Error inserting data: %s" (u/pprint-to-str 'red statements))
                (jdbc/print-sql-exception-chain e)
                (throw e)))))))

(defmethod load-data/load-data! :databricks-jdbc
  [& args]
  (apply load-data/load-data-and-add-ids! args))

#_(defmethod load-data/load-data! :databricks-jdbc [& args]
  (apply (get-method load-data/load-data! :sql-jdbc) args))

;; TODO: Verify!
(defmethod execute/execute-sql! :databricks-jdbc [& args]
  (apply execute/sequentially-execute-sql! args))

;; TODO: Is INT OK? Probably.
(defmethod sql.tx/pk-sql-type :databricks-jdbc [_] "INT")

;; TODO: Verify!
(defmethod tx/supports-time-type? :databricks-jdbc [_driver] false)
(defmethod tx/supports-timestamptz-type? :databricks-jdbc [_driver] false)

;; Following is necessary!
(defmethod sql.tx/drop-db-if-exists-sql :databricks-jdbc
  [driver {:keys [database-name]}]
  (format "DROP DATABASE IF EXISTS %s CASCADE" (sql.tx/qualify-and-quote driver database-name)))

;; Should I borrow following from Spark?
#_(defmethod sql.tx/field-base-type->sql-type [:sparksql :type/Time] [_ _]
    (throw (UnsupportedOperationException. "SparkSQL does not have a TIME data type.")))
