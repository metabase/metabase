(ns metabase-enterprise.workspaces.driver.h2
  "H2-specific implementations for workspace isolation.

  H2 differences from PostgreSQL:
  - H2 doesn't support CREATE USER with PASSWORD syntax like Postgres
  - H2 uses CREATE USER userName PASSWORD 'password'
  - H2 GRANT syntax: GRANT { SELECT | ALL } ON { SCHEMA schemaName | tableName } TO userName
  - H2 supports CREATE TABLE ... AS SELECT syntax for table duplication"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]))

(defmethod isolation/grant-read-access-to-tables! :h2
  [database username tables]
  (let [driver    (driver.u/database->driver database)
        jdbc-spec (sql-jdbc.conn/connection-details->spec driver (:details database))
        schemas   (distinct (map :schema tables))]
    ;; H2 uses GRANT SELECT ON SCHEMA schemaName TO userName
    (doseq [schema schemas]
      (jdbc/execute! jdbc-spec [(format "GRANT SELECT ON SCHEMA \"%s\" TO \"%s\"" schema username)]))
    ;; Also grant on individual tables for more fine-grained access
    (doseq [table tables]
      (jdbc/execute! jdbc-spec [(format "GRANT SELECT ON \"%s\".\"%s\" TO \"%s\""
                                        (:schema table) (:name table) username)]))))

(defmethod isolation/init-workspace-database-isolation! :h2
  [database workspace]
  (let [driver        (driver.u/database->driver database)
        schema-name   (driver.common/isolation-namespace-name workspace)
        ;; H2 uses simpler user creation syntax
        read-user     {:user     (driver.common/isolation-user-name workspace)
                       :password (str (random-uuid))}
        jdbc-spec     (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (doseq [sql [(format "CREATE SCHEMA IF NOT EXISTS \"%s\"" schema-name)
                 ;; H2 syntax: CREATE USER userName PASSWORD 'password'
                 (format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD '%s'"
                         (:user read-user) (:password read-user))
                 ;; Grant access on the isolation schema
                 (format "GRANT ALL ON SCHEMA \"%s\" TO \"%s\"" schema-name (:user read-user))]]
      (jdbc/execute! jdbc-spec [sql]))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/duplicate-output-table! :h2
  [database workspace output]
  (let [details         (:details database)
        driver*         (driver.u/database->driver database)
        jdbc-spec       (sql-jdbc.conn/connection-details->spec driver* details)
        source-schema   (:schema output)
        source-table    (:name output)
        isolated-schema (:schema workspace)
        isolated-table  (driver.common/isolated-table-name output)]
    (assert (every? some? [source-schema source-table isolated-schema isolated-table])
            "All table identifiers must be present")
    ;; H2 supports CREATE TABLE AS SELECT syntax
    ;; Using LIMIT 0 instead of WITH NO DATA (which is Postgres-specific)
    (doseq [sql [(format "CREATE TABLE \"%s\".\"%s\" AS SELECT * FROM \"%s\".\"%s\" WHERE 1=0"
                         isolated-schema
                         isolated-table
                         source-schema
                         source-table)
                 ;; Grant ownership/access to the isolation user
                 (format "GRANT ALL ON \"%s\".\"%s\" TO \"%s\""
                         isolated-schema
                         isolated-table
                         (-> workspace :database_details :user))]]
      (jdbc/execute! jdbc-spec [sql]))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

(defmethod isolation/drop-isolated-tables! :h2
  [database s+t-tuples]
  (let [driver    (driver.u/database->driver database)
        jdbc-spec (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (run!
     (fn [[schema-name table-name]]
       (jdbc/execute! jdbc-spec
                      [(format "DROP TABLE IF EXISTS \"%s\".\"%s\""
                               schema-name table-name)]))
     s+t-tuples)))
