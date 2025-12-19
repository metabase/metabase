(ns metabase-enterprise.workspaces.driver.snowflake
  "Snowflake-specific implementations for workspace isolation.

  Approach: Creates a dedicated role per workspace, grants privileges to the role, then grants
  the role to a dedicated user. Uses GRANT OWNERSHIP to transfer output table ownership.

  Required permissions: CREATE SCHEMA, CREATE USER, CREATE ROLE, and GRANT OWNERSHIP privileges."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defn- isolation-role-name
  "Generate role name for workspace isolation."
  [workspace]
  (format "MB_ISOLATION_ROLE_%s" (:id workspace)))

(defmethod isolation/init-workspace-database-isolation! :snowflake
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        db-name     (-> database :details :db)
        warehouse   (-> database :details :warehouse)
        role-name   (isolation-role-name workspace)
        read-user   {:user     (ws.u/isolation-user-name workspace)
                     :password (ws.u/random-isolated-password)}
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; Snowflake RBAC: create schema -> create role -> grant privileges to role -> create user -> grant role to user
    (doseq [sql [(format "CREATE SCHEMA IF NOT EXISTS \"%s\".\"%s\"" db-name schema-name)
                 (format "CREATE ROLE IF NOT EXISTS \"%s\"" role-name)
                 (format "GRANT USAGE ON DATABASE \"%s\" TO ROLE \"%s\"" db-name role-name)
                 (format "GRANT USAGE ON WAREHOUSE \"%s\" TO ROLE \"%s\"" warehouse role-name)
                 (format "GRANT USAGE ON SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema-name role-name)
                 (format "GRANT ALL PRIVILEGES ON SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema-name role-name)
                 (format "GRANT ALL ON FUTURE TABLES IN SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema-name role-name)
                 (format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD = '%s' MUST_CHANGE_PASSWORD = FALSE DEFAULT_ROLE = \"%s\""
                         (:user read-user) (:password read-user) role-name)
                 (format "GRANT ROLE \"%s\" TO USER \"%s\"" role-name (:user read-user))]]
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
      (jdbc/execute! conn-spec [(format "GRANT USAGE ON SCHEMA \"%s\".\"%s\" TO ROLE \"%s\"" db-name schema role-name)]))
    (doseq [table tables]
      (jdbc/execute! conn-spec [(format "GRANT SELECT ON TABLE \"%s\".\"%s\".\"%s\" TO ROLE \"%s\""
                                        db-name (:schema table) (:name table) role-name)]))))

(defmethod isolation/destroy-workspace-isolation! :snowflake
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        db-name     (-> database :details :db)
        role-name   (isolation-role-name workspace)
        username    (ws.u/isolation-user-name workspace)
        conn-spec   (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
    ;; Drop in reverse order of creation: schema (CASCADE handles tables) -> user -> role
    (doseq [sql [(format "DROP SCHEMA IF EXISTS \"%s\".\"%s\" CASCADE" db-name schema-name)
                 (format "DROP USER IF EXISTS \"%s\"" username)
                 (format "DROP ROLE IF EXISTS \"%s\"" role-name)]]
      (jdbc/execute! conn-spec [sql]))))
