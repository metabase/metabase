(ns metabase-enterprise.workspaces.driver.clickhouse
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defmethod isolation/duplicate-output-table! :clickhouse
  [database workspace output]
  (let [source-schema   (:schema output)
        source-table    (:name output)
        isolated-db     (:schema workspace)
        isolated-table  (driver.common/isolated-table-name output)]
    (assert (every? some? [source-schema source-table isolated-db isolated-table]) "Figured out table")
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        ;; ClickHouse: CREATE TABLE new AS old copies structure only (no data)
        ;; No ALTER OWNER needed - user already has GRANT ALL on the isolated database
        (.execute ^java.sql.Statement stmt
                  (format "CREATE TABLE `%s`.`%s` AS `%s`.`%s`"
                          isolated-db
                          isolated-table
                          source-schema
                          source-table))))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-db isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))
