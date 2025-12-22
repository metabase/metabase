(ns metabase-enterprise.workspaces.driver.sqlserver
  "SQL Server-specific implementations for workspace isolation.

  Approach: Creates a server-level LOGIN, then a database-level USER mapped to that login,
  then grants CONTROL on the isolation schema. Tables inherit permissions from schema.

  Required permissions: CREATE LOGIN (server-level), CREATE USER, CREATE SCHEMA, and GRANT CONTROL."
  (:require
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

(defn- isolation-login-name
  "Generate login name for workspace isolation."
  [workspace]
  (format "mb_isolation_%s_login" (:id workspace)))

(defmethod isolation/init-workspace-database-isolation! :sqlserver
  [driver database-or-conn workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        login-name  (isolation-login-name workspace)
        read-user   {:user     (ws.u/isolation-user-name workspace)
                     :password (ws.u/random-isolated-password)}]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         ;; SQL Server: create login (server level), then user (database level), then schema
         (doseq [sql [(format (str "IF NOT EXISTS (SELECT name FROM master.sys.server_principals WHERE name = '%s') "
                                   "CREATE LOGIN [%s] WITH PASSWORD = N'%s'")
                              login-name login-name (:password read-user))
                      (format "IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = '%s') CREATE USER [%s] FOR LOGIN [%s]"
                              (:user read-user) (:user read-user) login-name)
                      (format "IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '%s') EXEC('CREATE SCHEMA [%s]')"
                              schema-name schema-name)
                      (format "GRANT CONTROL ON SCHEMA::[%s] TO [%s]" schema-name (:user read-user))]]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/grant-read-access-to-tables! :sqlserver
  [driver database-or-conn workspace tables]
  (let [username (-> workspace :database_details :user)
        schemas  (distinct (map :schema tables))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [schema schemas]
           (.addBatch ^Statement stmt
                      ^String (format "GRANT SELECT ON SCHEMA::[%s] TO [%s]" schema username)))
         (doseq [table tables]
           (.addBatch ^Statement stmt
                      ^String (format "GRANT SELECT ON [%s].[%s] TO [%s]"
                                      (:schema table) (:name table) username)))
         (.executeBatch ^Statement stmt))))))

(defmethod isolation/destroy-workspace-isolation! :sqlserver
  [driver database-or-conn workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        login-name  (isolation-login-name workspace)
        username    (ws.u/isolation-user-name workspace)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         ;; SQL Server requires dropping objects in schema before dropping schema
         (doseq [sql [;; Drop all tables in the schema first
                      (format (str "DECLARE @sql NVARCHAR(MAX) = ''; "
                                   "SELECT @sql += 'DROP TABLE [%s].[' + name + ']; ' "
                                   "FROM sys.tables WHERE schema_id = SCHEMA_ID('%s'); "
                                   "EXEC sp_executesql @sql")
                              schema-name schema-name)
                      ;; Drop schema (must be empty)
                      (format "IF EXISTS (SELECT * FROM sys.schemas WHERE name = '%s') DROP SCHEMA [%s]"
                              schema-name schema-name)
                      ;; Drop database user
                      (format "IF EXISTS (SELECT * FROM sys.database_principals WHERE name = '%s') DROP USER [%s]"
                              username username)
                      ;; Drop server login
                      (format "IF EXISTS (SELECT * FROM master.sys.server_principals WHERE name = '%s') DROP LOGIN [%s]"
                              login-name login-name)]]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))))
