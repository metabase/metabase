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

(defmethod sql.tx/field-base-type->sql-type [:mysql :type/BigInteger]     [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Boolean]        [_ _] "BOOLEAN") ; Synonym of TINYINT(1)
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Date]           [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/DateTime]       [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/DateTimeWithTZ] [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Decimal]        [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Float]          [_ _] "DOUBLE")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Integer]        [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Text]           [_ _] "TEXT")
(defmethod sql.tx/field-base-type->sql-type [:mysql :type/Time]           [_ _] "TIME")

(defmethod tx/dbdef->connection-details :mysql [_ context {:keys [database-name]}]
  (merge
   {:host (tx/db-test-env-var-or-throw :mysql :host "localhost")
    :port (tx/db-test-env-var-or-throw :mysql :port 3306)
    :user (tx/db-test-env-var :mysql :user "root")}
   (when-let [password (tx/db-test-env-var :mysql :password)]
     {:password password})
   (when (= context :db)
     {:db database-name})))

;; TODO - we might be able to do SQL all at once by setting `allowMultiQueries=true` on the connection string
(defmethod execute/execute-sql! :mysql [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/load-data! :mysql [& args]
  (apply load-data/load-data-all-at-once! args))

(defmethod sql.tx/pk-sql-type :mysql [_] "INTEGER NOT NULL AUTO_INCREMENT")
