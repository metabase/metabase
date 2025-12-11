(ns metabase-enterprise.workspaces.driver.postgres
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

(defmethod isolation/grant-read-access-to-tables! :postgres
  [database workspace tables]
  (let [username (-> workspace :database_details :user)
        schemas  (distinct (map :schema tables))
        sqls     (concat
                  (for [schema schemas]
                    (format "GRANT USAGE ON SCHEMA %s TO %s" schema username))
                  (for [table tables]
                    (format "GRANT SELECT ON TABLE %s.%s TO %s" (:schema table) (:name table) username)))]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql sqls]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))))

(defmethod isolation/init-workspace-database-isolation! :postgres
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        read-user   {:user     (ws.u/isolation-user-name workspace)
                     :password (ws.u/random-isolated-password)}]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql [(format "CREATE SCHEMA %s" schema-name)
                     (format "CREATE USER %s WITH PASSWORD '%s'" (:user read-user) (:password read-user))
                     ;; grant schema access (CREATE to create tables, USAGE to access them)
                     (format "GRANT ALL PRIVILEGES ON SCHEMA %s TO %s" schema-name (:user read-user))
                     ;; grant all privileges on future tables created in this schema (by admin)
                     (format "ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT ALL ON TABLES TO %s" schema-name (:user read-user))]]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/drop-isolated-tables! :postgres
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [[schema-name table-name] s+t-tuples]
          (.addBatch ^Statement stmt
                     ^String (format "DROP TABLE IF EXISTS \"%s\".\"%s\""
                                     schema-name table-name)))
        (.executeBatch ^Statement stmt)))))

(defmethod isolation/cleanup-workspace-isolation! :postgres
  [database workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        username    (ws.u/isolation-user-name workspace)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^Connection (:connection t-conn))]
        (doseq [sql [;; CASCADE drops all objects (tables, etc.) in the schema
                     (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name)
                     (format "DROP USER IF EXISTS \"%s\"" username)]]
          (.addBatch ^Statement stmt ^String sql))
        (.executeBatch ^Statement stmt)))))
