(ns metabase-enterprise.workspaces.driver.redshift
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defmethod isolation/duplicate-output-table! :redshift [database workspace output]
  (let [source-schema      (:schema output)
        source-table       (:name output)
        isolated-schema    (:schema workspace)
        isolated-table     (driver.common/isolated-table-name output)]
    (assert (every? some? [source-schema source-table isolated-schema isolated-table]) "Figured out table")
    ;; TODO: execute the following only if the transform was previously executed and its table exists.
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql [(format (str "CREATE TABLE \"%s\".\"%s\"" " (LIKE \"%s\".\"%s\")")
                             isolated-schema
                             isolated-table
                             source-schema
                             source-table)
                     (format "ALTER TABLE \"%s\".\"%s\" OWNER TO %s" isolated-schema isolated-table (-> workspace :database_details :user))]]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))
