(ns metabase-enterprise.workspaces.driver.sqlserver
  "SQL Server-specific implementations for workspace isolation.

  SQL Server differences from other drivers:
  - Uses SELECT INTO ... WHERE 1=0 for structure-only table copies
  - Uses square brackets [] for identifier quoting
  - Users are created with LOGIN, then USER for the database
  - Schemas exist within databases"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defn- isolation-login-name
  "Generate login name for workspace isolation."
  [workspace]
  (format "mb_isolation_%s_login" (:id workspace)))

(defmethod isolation/init-workspace-database-isolation! :sqlserver
  [database workspace]
  (let [schema-name (driver.common/isolation-namespace-name workspace)
        login-name  (isolation-login-name workspace)
        read-user   {:user     (driver.common/isolation-user-name workspace)
                     :password (driver.common/random-isolated-password)}
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; SQL Server: create login (server level), then user (database level), then schema
    (doseq [sql [;; Create the login at server level (if not exists)
                 (format (str "IF NOT EXISTS (SELECT name FROM master.sys.server_principals WHERE name = '%s') "
                              "CREATE LOGIN [%s] WITH PASSWORD = N'%s'")
                         login-name login-name (:password read-user))
                 ;; Create the user in this database for the login
                 (format "IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = '%s') CREATE USER [%s] FOR LOGIN [%s]"
                         (:user read-user) (:user read-user) login-name)
                 ;; Create the isolation schema
                 (format "IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '%s') EXEC('CREATE SCHEMA [%s]')"
                         schema-name schema-name)
                 ;; Grant schema privileges to the user
                 (format "GRANT CONTROL ON SCHEMA::[%s] TO [%s]" schema-name (:user read-user))]]
      (jdbc/execute! conn-spec [sql]))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/grant-read-access-to-tables! :sqlserver
  [database workspace tables]
  (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))
        username  (-> workspace :database_details :user)
        schemas   (distinct (map :schema tables))]
    ;; Grant SELECT on each schema
    (doseq [schema schemas]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON SCHEMA::[%s] TO [%s]" schema username)]))
    ;; Also grant on individual tables for fine-grained control
    (doseq [table tables]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON [%s].[%s] TO [%s]"
                                        (:schema table) (:name table) username)]))))

(defmethod isolation/duplicate-output-table! :sqlserver
  [database workspace output]
  (let [source-schema   (:schema output)
        source-table    (:name output)
        isolated-schema (:schema workspace)
        isolated-table  (driver.common/isolated-table-name output)
        conn-spec       (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    (assert (every? some? [source-schema source-table isolated-schema isolated-table]) "Figured out table")
    ;; SQL Server: SELECT INTO with WHERE 1=0 copies structure only (no data)
    (doseq [sql [(format "SELECT * INTO [%s].[%s] FROM [%s].[%s] WHERE 1=0"
                         isolated-schema
                         isolated-table
                         source-schema
                         source-table)
                 ;; Transfer ownership to the isolation user via schema permissions
                 ;; (user already has CONTROL on the schema from init)
                 ]]
      (when (seq sql)
        (jdbc/execute! conn-spec [sql])))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

(defmethod isolation/drop-isolated-tables! :sqlserver
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (doseq [[schema-name table-name] s+t-tuples]
        (jdbc/execute! conn-spec [(format "IF OBJECT_ID('[%s].[%s]', 'U') IS NOT NULL DROP TABLE [%s].[%s]"
                                          schema-name table-name schema-name table-name)])))))
