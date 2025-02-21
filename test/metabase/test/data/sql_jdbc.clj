(ns metabase.test.data.sql-jdbc
  "Common test extension functionality for SQL-JDBC drivers."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.initialize :as initialize]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(driver/register! :sql-jdbc/test-extensions, :abstract? true)

(sql.tx/add-test-extensions! :sql-jdbc/test-extensions)

(defn add-test-extensions! [driver]
  (initialize/initialize-if-needed! :plugins)
  (driver/add-parent! driver :sql-jdbc/test-extensions)
  (log/infof "Added SQL JDBC test extensions for %s ➕" driver))

(mu/defmethod tx/dataset-already-loaded? :sql-jdbc/test-extensions
  [driver :- :keyword
   dbdef  :- [:map [:database-name :string]]]
  (let [details   (tx/dbdef->connection-details driver :db dbdef)
        jdbc-spec (sql-jdbc.conn/connection-details->spec driver details)]
    (try
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       jdbc-spec
       {:write? false}
       (fn [^java.sql.Connection _conn]
         true))
      (catch Throwable _e
        false))))

(defmethod tx/create-db! :sql-jdbc/test-extensions
  [& args]
  (apply load-data/create-db! args))

(defmethod tx/destroy-db! :sql-jdbc/test-extensions
  [driver dbdef]
  (load-data/destroy-db! driver dbdef))

(defmethod tx/create-view-of-table! :sql-jdbc/test-extensions
  [driver database view-name table-name options]
  (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec database)
                 (sql.tx/create-view-of-table-sql driver database view-name table-name options)
                 {:transaction? false}))

(defmethod tx/drop-view! :sql-jdbc/test-extensions
  [driver database view-name options]
  (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec database)
                 (sql.tx/drop-view-sql driver database view-name options)
                 {:transaction? false}))
