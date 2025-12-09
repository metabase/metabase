(ns metabase-enterprise.workspaces.driver.snowflake
  "Snowflake-specific implementations for workspace isolation.

  Snowflake differences from other drivers:
  - DDL statements are not transactional and must be executed with {:transaction? false}
  - Uses CREATE TABLE ... LIKE for structure-only copies
  - Uses ROLE-based access control (RBAC) - privileges granted to roles, roles granted to users
  - Schema names and identifiers use double quotes for quoting"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defn- isolation-role-name
  "Generate role name for workspace isolation."
  [workspace]
  (format "MB_ISOLATION_ROLE_%s" (:id workspace)))

(defmethod isolation/init-workspace-database-isolation! :snowflake
  [database workspace]
  (let [schema-name (driver.common/isolation-namespace-name workspace)
        db-name     (-> database :details :db)
        warehouse   (-> database :details :warehouse)
        role-name   (isolation-role-name workspace)
        read-user   {:user     (driver.common/isolation-user-name workspace)
                     :password (driver.common/random-isolated-password)}
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; Snowflake RBAC: create role, grant privileges to role, grant role to user
    (doseq [sql [;; Create the isolation schema (must use fully qualified name)
                 (format "CREATE SCHEMA IF NOT EXISTS \"%s\".\"%s\"" db-name schema-name)
                 ;; Create a role for this workspace
                 (format "CREATE ROLE IF NOT EXISTS %s" role-name)
                 ;; Grant database usage to the role (required to set current database)
                 (format "GRANT USAGE ON DATABASE \"%s\" TO ROLE %s" db-name role-name)
                 ;; Grant warehouse usage to the role (required to execute queries)
                 (format "GRANT USAGE ON WAREHOUSE \"%s\" TO ROLE %s" warehouse role-name)
                 ;; Grant schema privileges to the role
                 (format "GRANT USAGE ON SCHEMA \"%s\".\"%s\" TO ROLE %s" db-name schema-name role-name)
                 (format "GRANT ALL PRIVILEGES ON SCHEMA \"%s\".\"%s\" TO ROLE %s" db-name schema-name role-name)
                 ;; Grant all privileges on future tables created in this schema
                 (format "GRANT ALL ON FUTURE TABLES IN SCHEMA \"%s\".\"%s\" TO ROLE %s" db-name schema-name role-name)
                 ;; Create the user
                 (format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD = '%s' MUST_CHANGE_PASSWORD = FALSE DEFAULT_ROLE = %s"
                         (:user read-user) (:password read-user) role-name)
                 ;; Grant the role to the user
                 (format "GRANT ROLE %s TO USER \"%s\"" role-name (:user read-user))]]
      (jdbc/execute! conn-spec [sql]))
    {:schema           schema-name
     :database_details (assoc read-user :role role-name)}))

(defmethod isolation/grant-read-access-to-tables! :snowflake
  [database workspace tables]
  (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))
        db-name   (-> database :details :db)
        role-name (-> workspace :database_details :role)
        schemas   (distinct (map :schema tables))]
    (doseq [schema schemas]
      (jdbc/execute! conn-spec [(format "GRANT USAGE ON SCHEMA \"%s\".\"%s\" TO ROLE %s" db-name schema role-name)]))
    (doseq [table tables]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON TABLE \"%s\".\"%s\".\"%s\" TO ROLE %s"
                                        db-name (:schema table) (:name table) role-name)]))))

(defmethod isolation/duplicate-output-table! :snowflake
  [database workspace output]
  (let [source-schema   (:schema output)
        source-table    (:name output)
        isolated-schema (:schema workspace)
        isolated-table  (driver.common/isolated-table-name output)
        db-name         (-> database :details :db)
        role-name       (-> workspace :database_details :role)
        conn-spec       (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    (assert (every? some? [source-schema source-table isolated-schema isolated-table]) "Figured out table")
    ;; Snowflake: CREATE TABLE ... LIKE creates structure only (no data)
    (doseq [sql [(format "CREATE TABLE \"%s\".\"%s\".\"%s\" LIKE \"%s\".\"%s\".\"%s\""
                         db-name
                         isolated-schema
                         isolated-table
                         db-name
                         source-schema
                         source-table)
                 ;; Grant ownership to the isolation role
                 (format "GRANT OWNERSHIP ON TABLE \"%s\".\"%s\".\"%s\" TO ROLE %s COPY CURRENT GRANTS"
                         db-name isolated-schema isolated-table role-name)]]
      (jdbc/execute! conn-spec [sql]))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

(defmethod isolation/drop-isolated-tables! :snowflake
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (:id database))
          db-name   (-> database :details :db)]
      (doseq [[schema-name table-name] s+t-tuples]
        (jdbc/execute! conn-spec [(format "DROP TABLE IF EXISTS \"%s\".\"%s\".\"%s\"" db-name schema-name table-name)])))))
