(ns metabase-enterprise.workspaces.driver.clickhouse
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defmethod isolation/init-workspace-database-isolation! :clickhouse
  [database workspace]
  (let [db-name   (driver.common/isolation-namespace-name workspace)
        read-user {:user     (driver.common/isolation-user-name workspace)
                   :password (driver.common/random-isolated-password)}]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql [(format "CREATE DATABASE IF NOT EXISTS `%s`" db-name)
                     (format "CREATE USER IF NOT EXISTS %s IDENTIFIED BY '%s'"
                             (:user read-user) (:password read-user))
                     (format "GRANT ALL ON `%s`.* TO %s" db-name (:user read-user))]]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))
    {:schema           db-name
     :database_details read-user}))

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
        (.execute ^java.sql.Statement stmt
                  (format "CREATE TABLE `%s`.`%s` AS `%s`.`%s`"
                          isolated-db
                          isolated-table
                          source-schema
                          source-table))))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-db isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

(defmethod isolation/grant-read-access-to-tables! :clickhouse
  [database workspace tables]
  (let [read-user-name (-> workspace :database_details :user)
        sqls           (for [table tables]
                         (format "GRANT SELECT ON `%s`.`%s` TO %s"
                                 (:schema table)
                                 (:name table)
                                 read-user-name))]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql sqls]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))))

(defmethod isolation/drop-isolated-tables! :clickhouse
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [[db-name table-name] s+t-tuples]
          (.addBatch ^java.sql.Statement stmt
                     ^String (format "DROP TABLE IF EXISTS `%s`.`%s`"
                                     db-name table-name)))
        (.executeBatch ^java.sql.Statement stmt)))))
