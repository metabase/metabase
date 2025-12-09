(ns metabase-enterprise.workspaces.driver.postgres
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defmethod isolation/grant-read-access-to-tables! :postgres
  [database username tables]
  (let [schemas (distinct (map :schema tables))
        sqls    (concat
                 (for [schema schemas]
                   (format "GRANT USAGE ON SCHEMA %s TO %s" schema username))
                 (for [table tables]
                   (format "GRANT SELECT ON TABLE %s.%s TO %s" (:schema table) (:name table) username)))]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql sqls]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))))

(defmethod isolation/init-workspace-database-isolation! :postgres
  [database workspace]
  (let [schema-name (driver.common/isolation-namespace-name workspace)
        read-user   {:user     (driver.common/isolation-user-name workspace)
                     :password (driver.common/random-isolated-password)}]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql [(format "CREATE SCHEMA %s" schema-name)
                     (format "CREATE USER %s WITH PASSWORD '%s'" (:user read-user) (:password read-user))
                     ;; grant schema access (CREATE to create tables, USAGE to access them)
                     (format "GRANT ALL PRIVILEGES ON SCHEMA %s TO %s" schema-name (:user read-user))
                     ;; grant all privileges on future tables created in this schema (by admin)
                     (format "ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT ALL ON TABLES TO %s" schema-name (:user read-user))]]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/duplicate-output-table! :postgres
  [database workspace output]
  (let [source-schema   (:schema output)
        source-table    (:name output)
        isolated-schema (:schema workspace)
        isolated-table  (driver.common/isolated-table-name output)]
    (assert (every? some? [source-schema source-table isolated-schema isolated-table]) "Figured out table")
    ;; TODO: execute the following only if the transform was previously executed and its table exists.
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql [(format (str "CREATE TABLE \"%s\".\"%s\""
                                  "  AS SELECT * FROM \"%s\".\"%s\""
                                  " WITH NO DATA")
                             isolated-schema
                             isolated-table
                             source-schema
                             source-table)
                     (format "ALTER TABLE \"%s\".\"%s\" OWNER TO %s" isolated-schema isolated-table (-> workspace :database_details :user))]]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

(defmethod isolation/drop-isolated-tables! :postgres
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [[schema-name table-name] s+t-tuples]
          (.addBatch ^java.sql.Statement stmt
                     ^String (format "DROP TABLE IF EXISTS \"%s\".\"%s\""
                                     schema-name table-name)))
        (.executeBatch ^java.sql.Statement stmt)))))
