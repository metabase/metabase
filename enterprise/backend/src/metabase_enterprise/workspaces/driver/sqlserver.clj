(ns metabase-enterprise.workspaces.driver.sqlserver
  "SQL Server-specific implementations for workspace isolation.

  Approach: Creates a server-level LOGIN, then a database-level USER mapped to that login,
  then grants CONTROL on the isolation schema. Tables inherit permissions from schema.

  Required permissions: CREATE LOGIN (server-level), CREATE USER, CREATE SCHEMA, and GRANT CONTROL."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defn- isolation-login-name
  "Generate login name for workspace isolation."
  [workspace]
  (format "mb_isolation_%s_login" (:id workspace)))

(defmethod isolation/init-workspace-database-isolation! :sqlserver
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        login-name  (isolation-login-name workspace)
        read-user   {:user     (ws.u/isolation-user-name workspace)
                     :password (ws.u/random-isolated-password)}
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; SQL Server: create login (server level), then user (database level), then schema
    (doseq [sql [(format (str "IF NOT EXISTS (SELECT name FROM master.sys.server_principals WHERE name = '%s') "
                              "CREATE LOGIN [%s] WITH PASSWORD = N'%s'")
                         login-name login-name (:password read-user))
                 (format "IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = '%s') CREATE USER [%s] FOR LOGIN [%s]"
                         (:user read-user) (:user read-user) login-name)
                 (format "IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '%s') EXEC('CREATE SCHEMA [%s]')"
                         schema-name schema-name)
                 (format "GRANT CONTROL ON SCHEMA::[%s] TO [%s]" schema-name (:user read-user))]]
      (jdbc/execute! conn-spec [sql]))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/grant-read-access-to-tables! :sqlserver
  [database workspace tables]
  (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))
        username  (-> workspace :database_details :user)
        schemas   (distinct (map :schema tables))]
    (doseq [schema schemas]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON SCHEMA::[%s] TO [%s]" schema username)]))
    (doseq [table tables]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON [%s].[%s] TO [%s]"
                                        (:schema table) (:name table) username)]))))

(defmethod isolation/drop-isolated-tables! :sqlserver
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (doseq [[schema-name table-name] s+t-tuples]
        (jdbc/execute! conn-spec [(format "IF OBJECT_ID('[%s].[%s]', 'U') IS NOT NULL DROP TABLE [%s].[%s]"
                                          schema-name table-name schema-name table-name)])))))

(defmethod isolation/destroy-workspace-isolation! :sqlserver
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        login-name  (isolation-login-name workspace)
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
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
      (jdbc/execute! conn-spec [sql]))))
