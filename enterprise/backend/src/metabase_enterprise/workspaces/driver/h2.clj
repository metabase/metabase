(ns metabase-enterprise.workspaces.driver.h2
  "H2-specific implementations for workspace isolation.

  H2 differences from PostgreSQL:
  - H2 doesn't support CREATE USER with PASSWORD syntax like Postgres
  - H2 uses CREATE USER userName PASSWORD 'password'
  - H2 GRANT syntax: GRANT { SELECT | ALL } ON { SCHEMA schemaName | tableName } TO userName
  - H2 supports CREATE TABLE ... AS SELECT syntax for table duplication
  - H2 connection details use a single :db key with embedded credentials in the connection string"
  (:require
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.h2 :as h2]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

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
  [driver database-or-conn workspace tables]
  (let [username (-> workspace :database_details :db get-user-from-connection-string)
        schemas  (distinct (map :schema tables))]
    ;; H2 uses GRANT SELECT ON SCHEMA schemaName TO userName
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [schema schemas]
           (.addBatch ^Statement stmt
                      ^String (format "GRANT SELECT ON SCHEMA \"%s\" TO \"%s\"" schema username)))
         ;; Also grant on individual tables for more fine-grained access
         (doseq [table tables]
           (.addBatch ^Statement stmt
                      ^String (format "GRANT SELECT ON \"%s\".\"%s\" TO \"%s\""
                                      (:schema table) (:name table) username)))
         (.executeBatch ^Statement stmt))))))

(defmethod isolation/init-workspace-database-isolation! :h2
  [driver database-or-conn workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        username    (ws.u/isolation-user-name workspace)
        password    (ws.u/random-isolated-password)
        ;; H2 embeds credentials in the :db connection string, so we need to build a new one
        ;; When database-or-conn is {:connection conn}, we need to get the original db from elsewhere
        ;; For now, assume database-or-conn is a database map when we need to build connection details
        original-db (when (map? database-or-conn)
                      (or (get-in database-or-conn [:details :db])
                          ;; Fallback: try to get from database if it has :id
                          nil))
        new-db      (when original-db
                      (replace-credentials original-db username password))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [sql [(format "CREATE SCHEMA IF NOT EXISTS \"%s\"" schema-name)
                      ;; H2 syntax: CREATE USER userName PASSWORD 'password'
                      (format "CREATE USER IF NOT EXISTS \"%s\" PASSWORD '%s'" username password)
                      ;; Grant access on the isolation schema
                      (format "GRANT ALL ON SCHEMA \"%s\" TO \"%s\"" schema-name username)]]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))
    {:schema           schema-name
     :database_details {:db new-db}}))

(defmethod isolation/destroy-workspace-isolation! :h2
  [driver database-or-conn workspace]
  (let [schema-name (ws.u/isolation-namespace-name workspace)
        username    (ws.u/isolation-user-name workspace)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [sql [;; CASCADE drops all objects (tables, etc.) in the schema
                      (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name)
                      (format "DROP USER IF EXISTS \"%s\"" username)]]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))))
