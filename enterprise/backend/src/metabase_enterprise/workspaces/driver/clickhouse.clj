(ns metabase-enterprise.workspaces.driver.clickhouse
  "ClickHouse-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

(defmethod isolation/init-workspace-database-isolation! :clickhouse
  [database workspace]
  (let [db-name   (ws.u/isolation-namespace-name workspace)
        read-user {:user     (ws.u/isolation-user-name workspace)
                   :password (ws.u/random-isolated-password)}]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql [(format "CREATE DATABASE IF NOT EXISTS `%s`" db-name)
                     (format "CREATE USER IF NOT EXISTS `%s` IDENTIFIED BY '%s'"
                             (:user read-user) (:password read-user))
                     (format "GRANT ALL ON `%s`.* TO `%s`" db-name (:user read-user))]]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))
    {:schema           db-name
     :database_details read-user}))

(defmethod isolation/grant-read-access-to-tables! :clickhouse
  [database workspace tables]
  (let [read-user-name (-> workspace :database_details :user)
        sqls           (for [table tables]
                         (format "GRANT SELECT ON `%s`.`%s` TO `%s`"
                                 (:schema table)
                                 (:name table)
                                 read-user-name))]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql sqls]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))))

(defmethod isolation/destroy-workspace-isolation! :clickhouse
  [database workspace]
  (let [db-name      (ws.u/isolation-namespace-name workspace)
        username     (ws.u/isolation-user-name workspace)
        workspace-id (:id workspace)]
    (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      ;; Drop database - cascades to all tables within it
      (isolation/try-execute! conn
                              (format "DROP DATABASE IF EXISTS `%s`" db-name)
                              workspace-id "drop database")
      ;; Drop user
      (isolation/try-execute! conn
                              (format "DROP USER IF EXISTS `%s`" username)
                              workspace-id "drop user"))))
