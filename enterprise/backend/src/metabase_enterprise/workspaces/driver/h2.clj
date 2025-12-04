(ns metabase-enterprise.workspaces.driver.h2
  "H2-specific implementations for workspace isolation.

  H2 differences from PostgreSQL:
  - H2 doesn't support CREATE USER with PASSWORD syntax like Postgres
  - H2 uses CREATE USER userName PASSWORD 'password'
  - H2 GRANT syntax: GRANT { SELECT | ALL } ON { SCHEMA schemaName | tableName } TO userName
  - H2 supports CREATE TABLE ... AS SELECT syntax for table duplication
  - H2 connection details use a single :db key with embedded credentials in the connection string"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.h2 :as h2]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]))

(defn- replace-credentials
  "Replace USER and PASSWORD in an H2 connection string."
  [connection-string new-user new-password]
  (let [[file options] (h2/connection-string->file+options connection-string)]
    (h2/file+options->connection-string file (assoc options "USER" new-user "PASSWORD" new-password))))

(defn- get-user-from-connection-string
  "Extract the USER from an H2 connection string."
  [connection-string]
  (let [[_file options] (h2/connection-string->file+options connection-string)]
    (get options "USER")))

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
  (let [driver           (driver.u/database->driver database)
        schema-name      (driver.common/isolation-namespace-name workspace)
        username         (driver.common/isolation-user-name workspace)
        password         (str (random-uuid))
        jdbc-spec        (sql-jdbc.conn/connection-details->spec driver (:details database))
        ;; H2 embeds credentials in the :db connection string, so we need to build a new one
        original-db      (get-in database [:details :db])
        new-db           (replace-credentials original-db username password)]
    (doseq [sql [(format "CREATE SCHEMA IF NOT EXISTS \"%s\"" schema-name)
                 ;; H2 syntax: CREATE USER userName PASSWORD 'password'
                 (format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD '%s'" username password)
                 ;; Grant access on the isolation schema
                 (format "GRANT ALL ON SCHEMA \"%s\" TO \"%s\"" schema-name username)]]
      (jdbc/execute! jdbc-spec [#p sql]))
    {:schema           schema-name
     :database_details {:db new-db}}))

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
                 #_(format "GRANT ALL ON \"%s\".\"%s\" TO \"%s\""
                           isolated-schema
                           isolated-table
                           isolated-user)]]
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
