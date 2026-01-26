(ns metabase.test.data.mysql
  "Code for creating / destroying a MySQL database from a `DatabaseDefinition`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.test.data.impl.get-or-create :as test.data.impl.get-or-create]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]))

(sql-jdbc.tx/add-test-extensions! :mysql)

(defn grant-table-perms-to-roles!
  [driver details roles]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[role-name table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver role-name)]
        (doseq [[table-name perms] table-perms]
          (let [columns (:columns perms)
                select-cols (str/join ", " (map #(sql.tx/qualify-and-quote driver %) columns))
                grant-stmt (if (not= select-cols "")
                             (format "GRANT SELECT (%s) ON %s TO %s" select-cols table-name role-name)
                             (format "GRANT SELECT ON %s TO %s" table-name role-name))]
            (jdbc/execute! spec [grant-stmt] {:transaction? false})))))))

(defmethod tx/create-and-grant-roles! :mysql
  [driver details roles user-name default-role]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [statement [(format "DROP USER IF EXISTS '%s'@'%%';" user-name)
                       (format "CREATE USER '%s'@'%%' IDENTIFIED BY '';" user-name)
                       (format "DROP ROLE IF EXISTS %s;" default-role)
                       (format "CREATE ROLE %s;" default-role)
                       (format "GRANT SELECT ON *.* TO %s;" default-role)
                       (format "GRANT %s TO %s;" default-role user-name)
                       (format "SET DEFAULT ROLE %s %s %s;" default-role (if (mysql/mariadb? (mt/db)) "for" "to") user-name)]]
      (jdbc/execute! spec [statement]))
    (sql-jdbc.tx/drop-if-exists-and-create-roles! driver details roles)
    (grant-table-perms-to-roles! driver details roles)
    (sql-jdbc.tx/grant-roles-to-user! driver details roles user-name)))

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
                                   :type/JSON           "JSON"
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
;; Tech debt issue: #39343
(defmethod execute/execute-sql! :mysql
  [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod load-data/chunk-size :mysql
  [_driver _dbdef _tabledef]
  ;; load data all at once
  nil)

(defmethod load-data/do-insert! :mysql
  [driver conn table-identifier rows]
  (if-not load-data/*disable-fk-checks*
    ((get-method load-data/do-insert! :sql-jdbc/test-extensions) driver conn table-identifier rows)
    ;; Disable FK checks during insert to allow self-referencing FK rows in the same batch
    ;; (MySQL 9.6+ enforces FK constraints row-by-row during bulk INSERT)
    (do
      (jdbc/execute! {:connection conn} ["SET FOREIGN_KEY_CHECKS = 0"])
      (try
        ((get-method load-data/do-insert! :sql-jdbc/test-extensions) driver conn table-identifier rows)
        (finally
          (jdbc/execute! {:connection conn} ["SET FOREIGN_KEY_CHECKS = 1"]))))))

(defmethod sql.tx/pk-sql-type :mysql [_] "INTEGER NOT NULL AUTO_INCREMENT")

;;; use one single global lock for all datasets. MySQL needs a global lock to do DDL stuff and blows up if other queries
;;; are running at the same time even if they are in different logical databases
(defmethod test.data.impl.get-or-create/dataset-lock :mysql
  [driver _dataset-name]
  ((get-method test.data.impl.get-or-create/dataset-lock :sql-jdbc) driver ""))

(defmethod sql.tx/create-index-sql :mysql
  ([driver table-name field-names]
   (sql.tx/create-index-sql driver table-name field-names {}))
  ([driver table-name field-names {:keys [unique? method]}]
   (format "CREATE %sINDEX %s%s ON %s (%s);"
           (if unique? "UNIQUE " "")
           (str "idx_" table-name "_" (str/join "_" field-names))
           (if method (str " USING " method) "")
           (sql.tx/qualify-and-quote driver table-name)
           (str/join ", " (map #(sql.tx/format-and-quote-field-name driver %) field-names)))))
