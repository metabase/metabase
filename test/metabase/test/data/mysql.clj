(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]))

(sql-jdbc.tx/add-test-extensions! :mysql)

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BOOLEAN"
                                   :type/Date           "DATE"
                                   ;; (3) is fractional seconds precision, i.e. millisecond precision
                                   :type/DateTime       "DATETIME(3)"
                                   ;; MySQL is extra dumb and can't have two `TIMESTAMP` columns without default
                                   ;; values — see
                                   ;; https://stackoverflow.com/questions/11601034/unable-to-create-2-timestamp-columns-in-1-mysql-table.
                                   ;; They also have to have non-zero values. See also
                                   ;; https://dba.stackexchange.com/questions/6171/invalid-default-value-for-datetime-when-changing-to-utf8-general-ci
                                   :type/DateTimeWithTZ "TIMESTAMP(3) DEFAULT '1970-01-01 00:00:01'"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "DOUBLE"
                                   :type/Integer        "INTEGER"
                                   :type/Text           "TEXT"
                                   :type/Time           "TIME(3)"}]
  (defmethod sql.tx/field-base-type->sql-type [:mysql base-type] [_ _] database-type))

(defmethod tx/dbdef->connection-details :mysql
  [_ context {:keys [database-name]}]
  (merge
   {:host (tx/db-test-env-var-or-throw :mysql :host "localhost")
    :port (tx/db-test-env-var-or-throw :mysql :port 3306)
    :user (tx/db-test-env-var :mysql :user "root")}
   (when-let [password (tx/db-test-env-var :mysql :password)]
     {:password password})
   (when (= context :db)
     {:db database-name})))

(defmethod tx/aggregate-column-info :mysql
  ([driver ag-type]
   ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (= ag-type :sum)
      {:base_type :type/Decimal}))))

;; TODO - we might be able to do SQL all at once by setting `allowMultiQueries=true` on the connection string
(defmethod execute/execute-sql! :mysql
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/load-data! :mysql
  [& args]
  (apply load-data/load-data-all-at-once! args))

(defmethod sql.tx/pk-sql-type :mysql [_] "INTEGER NOT NULL AUTO_INCREMENT")
