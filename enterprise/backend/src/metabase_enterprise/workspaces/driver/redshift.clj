(ns metabase-enterprise.workspaces.driver.redshift
  "Redshift-specific implementations for workspace isolation.

  Redshift differs from PostgreSQL:
  - DROP OWNED BY is not supported
  - Must revoke privileges from all granted schemas before dropping user"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defn- user-exists?
  "Check if a Redshift user exists."
  [conn username]
  (seq (jdbc/query conn ["SELECT 1 FROM pg_user WHERE usename = ?" username])))

(defn- schema-exists?
  "Check if a schema exists in Redshift."
  [conn schema-name]
  (seq (jdbc/query conn ["SELECT 1 FROM pg_namespace WHERE nspname = ?" schema-name])))

(defn- schemas-with-user-grants
  "Query Redshift to find schemas where the user has been granted privileges."
  [conn username]
  (->> (jdbc/query conn
                   ["SELECT DISTINCT namespace_name FROM svv_relation_privileges
           WHERE identity_name = ? AND identity_type = 'user'"
                    username])
       (keep :namespace_name)))

(defmethod isolation/destroy-workspace-isolation! :redshift
  [database workspace]
  (let [schema-name  (:schema workspace)
        username     (-> workspace :database_details :user)
        workspace-id (:id workspace)]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (let [user-exists?    (user-exists? conn username)
            schema-exists?  (schema-exists? conn schema-name)
            granted-schemas (when user-exists?
                              (schemas-with-user-grants conn username))]
        ;; Revoke privileges from all granted schemas (best-effort)
        (when user-exists?
          (doseq [schema granted-schemas]
            (isolation/try-execute! conn
                                    (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"%s\" FROM \"%s\""
                                            schema username)
                                    workspace-id "revoke table privileges")
            (isolation/try-execute! conn
                                    (format "REVOKE ALL PRIVILEGES ON SCHEMA \"%s\" FROM \"%s\""
                                            schema username)
                                    workspace-id "revoke schema privileges"))
          ;; Revoke default privileges if schema exists
          (when schema-exists?
            (isolation/try-execute! conn
                                    (format "ALTER DEFAULT PRIVILEGES IN SCHEMA \"%s\" REVOKE ALL ON TABLES FROM \"%s\""
                                            schema-name username)
                                    workspace-id "revoke default privileges")))
        ;; Drop schema
        (isolation/try-execute! conn
                                (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name)
                                workspace-id "drop schema")
        ;; Drop user
        (isolation/try-execute! conn
                                (format "DROP USER IF EXISTS \"%s\"" username)
                                workspace-id "drop user")))))
