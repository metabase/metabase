(ns metabase.test.data.sqlserver
  "Code for creating / destroying a SQLServer database from a `DatabaseDefinition`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :sqlserver)

(defn drop-if-exists-and-create-roles!
  [driver details roles]
  (let [spec  (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[user-name _table-perms] roles]
      (let [role-login (str user-name "_login")
            role-name (sql.tx/qualify-and-quote driver (str user-name "_role"))
            user-name (sql.tx/qualify-and-quote driver user-name)]
        (doseq [statement [(format (str "IF NOT EXISTS ("
                                        "SELECT name FROM master.sys.server_principals WHERE name = '%s')"
                                        "BEGIN CREATE LOGIN %s WITH PASSWORD = N'%s' END")
                                   role-login role-login (:password details))
                           (format "DROP USER IF EXISTS %s;" user-name)
                           (format "CREATE USER %s FOR LOGIN %s;" user-name role-login)
                           (format "DROP ROLE IF EXISTS %s;" role-name)
                           (format "CREATE ROLE %s;" role-name)]]
          (jdbc/execute! spec [statement] {:transaction? false}))))))

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

(defn grant-roles-to-user!
  [driver details roles db-user]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)
        db-user (sql.tx/qualify-and-quote driver db-user)]
    (doseq [[user-name _table-perms] roles]
      (let [role-name (sql.tx/qualify-and-quote driver (str user-name "_role"))
            user-name (sql.tx/qualify-and-quote driver user-name)]
        (doseq [statement [(format "EXEC sp_addrolemember %s, %s" role-name user-name)
                           (format "GRANT IMPERSONATE ON USER::%s TO %s" user-name db-user)]]
          (jdbc/execute! spec [statement] {:transaction? false}))))))

(defmethod tx/create-and-grant-roles! :sqlserver
  [driver details roles user-name _default-role]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)
        login-name (str user-name "_login")]
    ;; create a non-sa user
    (doseq [statement [(format (str "IF NOT EXISTS ("
                                    "SELECT name FROM master.sys.server_principals WHERE name = '%s')"
                                    " BEGIN CREATE LOGIN [%s] WITH PASSWORD = N'%s' END")
                               login-name login-name (:password details))
                       (format "DROP USER IF EXISTS [%s];" user-name)
                       (format "CREATE USER %s FOR LOGIN %s;" user-name login-name)
                       (format "EXEC sp_addrolemember 'db_owner', %s;" user-name)]]
      (jdbc/execute! spec [statement])))
  (drop-if-exists-and-create-roles! driver details roles)
  (grant-table-perms-to-roles! driver details roles)
  (grant-roles-to-user! driver details roles user-name))

(defmethod tx/drop-roles! :sqlserver
  [driver details roles db-user]
  (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
    (doseq [[user-name _table-perms] roles]
      (let [role-login (str user-name "_login")
            role-name (sql.tx/qualify-and-quote driver (str user-name "_role"))
            user-name (sql.tx/qualify-and-quote driver user-name)]
        (doseq [statement [(format "EXEC sp_droprolemember %s, %s" role-name user-name)
                           (format "REVOKE IMPERSONATE ON USER::%s FROM %s" user-name db-user)
                           (format "DROP ROLE IF EXISTS %s;" role-name)
                           (format "DROP USER IF EXISTS %s;" user-name)
                           (format "DROP LOGIN %s;" role-login)]]
          (jdbc/execute! spec [statement] {:transaction? false}))))
    (doseq [statement [(format "EXEC sp_droprolemember 'db_owner', %s" db-user)
                       (format "DROP USER IF EXISTS %s;" db-user)
                       (format "DROP LOGIN %s;" (str db-user "_login"))]]
      (jdbc/execute! spec [statement] {:transaction? false}))))

(doseq [[base-type database-type] {:type/BigInteger     "BIGINT"
                                   :type/Boolean        "BIT"
                                   :type/Date           "DATE"
                                   :type/DateTime       "DATETIME"
                                   :type/DateTimeWithTZ "DATETIMEOFFSET"
                                   :type/Decimal        "DECIMAL"
                                   :type/Float          "FLOAT"
                                   :type/Integer        "INTEGER"
                                   :type/UUID           "UNIQUEIDENTIFIER"
                                   ;; TEXT is considered deprecated -- see
                                   ;; https://msdn.microsoft.com/en-us/library/ms187993.aspx
                                   :type/Text           "VARCHAR(1024)"
                                   :type/Time           "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:sqlserver base-type] [_ _] database-type))

(defmethod tx/dbdef->connection-details :sqlserver
  [_ context {:keys [database-name]}]
  {:host     (tx/db-test-env-var-or-throw :sqlserver :host "localhost")
   :port     (Integer/parseInt (tx/db-test-env-var-or-throw :sqlserver :port "1433"))
   :user     (tx/db-test-env-var-or-throw :sqlserver :user "SA")
   :password (tx/db-test-env-var-or-throw :sqlserver :password "P@ssw0rd")
   :db       (when (= context :db)
               database-name)})

(defmethod sql.tx/drop-db-if-exists-sql :sqlserver
  [_ {:keys [database-name]}]
  ;; Kill all open connections to the DB & drop it
  (apply format "IF EXISTS (SELECT name FROM master.dbo.sysdatabases WHERE name = N'%s')
                 BEGIN
                     ALTER DATABASE \"%s\" SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE \"%s\";
                 END;"
         (repeat 3 database-name)))

(defmethod sql.tx/drop-table-if-exists-sql :sqlserver
  [_ {:keys [database-name]} {:keys [table-name]}]
  (let [db-name database-name]
    (format "IF object_id('%s.dbo.%s') IS NOT NULL DROP TABLE \"%s\".dbo.\"%s\";" db-name table-name db-name table-name)))

(defmethod sql.tx/qualified-name-components :sqlserver
  ([_ db-name]                       [db-name])
  ([_ db-name table-name]            [db-name "dbo" table-name])
  ([_ db-name table-name field-name] [db-name "dbo" table-name field-name]))

(defmethod sql.tx/pk-sql-type :sqlserver [_] "INT IDENTITY(1,1)")

(defmethod tx/aggregate-column-info :sqlserver
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer}))))

(defmethod sql.tx/create-view-of-table-sql :sqlserver
  [driver database view-name table-name {:keys [materialized?]}]
  (let [database-name (get-in database [:settings :database-source-dataset-name])
        qualified-view (sql.tx/qualify-and-quote driver view-name)
        qualified-table (sql.tx/qualify-and-quote driver database-name table-name)]
    (sql/format
     {(if materialized? :create-materialized-view :create-view) [[[:raw qualified-view]]]
      :select [:*]
      :from [[[:raw qualified-table]]]}
     :dialect (sql.qp/quote-style driver))))

(defmethod sql.tx/drop-view-sql :sqlserver
  [driver _database view-name {:keys [materialized?]}]
  (let [qualified-view (sql.tx/qualify-and-quote driver view-name)]
    (sql/format
     {(if materialized? :drop-materialized-view :drop-view) [[:if-exists [:raw qualified-view]]]}
     :dialect (sql.qp/quote-style driver))))

(defmethod sql.tx/generated-column-sql :sqlserver [_ expr]
  (format "AS (%s)" expr))

(defmethod sql.tx/generated-column-infers-type? :sqlserver [_] true)
