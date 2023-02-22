(ns metabase.test.data.sql-jdbc
  "Common test extension functionality for SQL-JDBC drivers."
  (:require
   [metabase.driver :as driver]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.initialize :as initialize]
   [metabase.util.log :as log]))

(driver/register! :sql-jdbc/test-extensions, :abstract? true)

(sql.tx/add-test-extensions! :sql-jdbc/test-extensions)

(defn add-test-extensions! [driver]
  (initialize/initialize-if-needed! :plugins)
  (driver/add-parent! driver :sql-jdbc/test-extensions)
  (log/infof "Added SQL JDBC test extensions for %s ➕" driver))

(defmethod tx/create-db! :sql-jdbc/test-extensions
  [& args]
  (apply load-data/create-db! args))

(defmethod tx/destroy-db! :sql-jdbc/test-extensions
  [driver dbdef]
  (load-data/destroy-db! driver dbdef))
