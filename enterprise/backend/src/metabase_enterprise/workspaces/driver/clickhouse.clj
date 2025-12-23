(ns metabase-enterprise.workspaces.driver.clickhouse
  "Postgres-specific implementations for workspace isolation."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod driver/database-supports? [:clickhouse :workspace] [_driver _feature _db] true)

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
  (let [db-name  (ws.u/isolation-namespace-name workspace)
        username (ws.u/isolation-user-name workspace)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (with-open [stmt (.createStatement ^java.sql.Connection (:connection t-conn))]
        (doseq [sql [;; DROP DATABASE cascades to all tables within it
                     (format "DROP DATABASE IF EXISTS `%s`" db-name)
                     (format "DROP USER IF EXISTS `%s`" username)]]
          (.addBatch ^java.sql.Statement stmt ^String sql))
        (.executeBatch ^java.sql.Statement stmt)))))
