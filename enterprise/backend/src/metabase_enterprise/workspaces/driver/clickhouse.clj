(ns metabase-enterprise.workspaces.driver.clickhouse
  "ClickHouse-specific implementations for workspace isolation."
  (:require
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

(defmethod isolation/init-workspace-database-isolation! :clickhouse
  [driver database-or-conn workspace]
  (let [db-name   (ws.u/isolation-namespace-name workspace)
        read-user {:user     (ws.u/isolation-user-name workspace)
                   :password (ws.u/random-isolated-password)}]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [sql [(format "CREATE DATABASE IF NOT EXISTS `%s`" db-name)
                      (format "CREATE USER IF NOT EXISTS `%s` IDENTIFIED BY '%s'"
                              (:user read-user) (:password read-user))
                      (format "GRANT ALL ON `%s`.* TO `%s`" db-name (:user read-user))]]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))
    {:schema           db-name
     :database_details read-user}))

(defmethod isolation/grant-read-access-to-tables! :clickhouse
  [driver database-or-conn workspace tables]
  (let [read-user-name (-> workspace :database_details :user)
        sqls           (for [table tables]
                         (format "GRANT SELECT ON `%s`.`%s` TO `%s`"
                                 (:schema table)
                                 (:name table)
                                 read-user-name))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [sql sqls]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))))

(defmethod isolation/destroy-workspace-isolation! :clickhouse
  [driver database-or-conn workspace]
  (let [db-name  (ws.u/isolation-namespace-name workspace)
        username (ws.u/isolation-user-name workspace)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     database-or-conn
     {:write? true}
     (fn [^Connection conn]
       (with-open [stmt (.createStatement conn)]
         (doseq [sql [;; DROP DATABASE cascades to all tables within it
                      (format "DROP DATABASE IF EXISTS `%s`" db-name)
                      (format "DROP USER IF EXISTS `%s`" username)]]
           (.addBatch ^Statement stmt ^String sql))
         (.executeBatch ^Statement stmt))))))
