(ns metabase-enterprise.workspaces.driver.postgres
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]))

(defmethod isolation/grant-read-access-to-tables! :postgres
  [database username tables]
  (let [driver    (driver.u/database->driver database)
        jdbc-spec (sql-jdbc.conn/connection-details->spec driver (:details database))
        schemas   (distinct (map :schema tables))]
    (doseq [schema schemas]
      (jdbc/execute! jdbc-spec [(format "GRANT USAGE ON SCHEMA %s TO %s" schema username)]))
    (doseq [table tables]
      (jdbc/execute! jdbc-spec [(format "GRANT SELECT ON TABLE %s.%s TO %s" (:schema table) (:name table) username)]))))

(defmethod isolation/init-workspace-database-isolation! :postgres
  [database workspace]
  (let [driver        (driver.u/database->driver database)
        schema-name   (driver.common/isolation-namespace-name workspace)
        read-user     {:user     (driver.common/isolation-user-name workspace)
                       :password (str (random-uuid))}
        jdbc-spec     (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (doseq [sql [(format "CREATE SCHEMA %s" schema-name)
                 (format "CREATE USER %s WITH PASSWORD '%s'" (:user read-user) (:password read-user))
                 ;; grant all access on the destination schema
                 (format "GRANT USAGE ON SCHEMA %s TO %s" schema-name (:user read-user))
                 ;; need to be able insert and dropping, rename tables from this chema
                 (format "GRANT ALL PRIVILEGES ON SCHEMA %s TO %s" schema-name (:user read-user))]]
      (jdbc/execute! jdbc-spec [sql]))
    {:schema           schema-name
     :database_details read-user}))

(defmethod isolation/drop-isolated-tables! :postgres
  [database s+t-tuples]
  (let [driver      (driver.u/database->driver database)
        jdbc-spec   (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (run!
     (fn [[schema-name table-name]]
       (jdbc/execute! jdbc-spec
                      [(format "DROP TABLE IF EXISTS \"%s\".\"%s\""
                               schema-name table-name)]))
     s+t-tuples)))
