(ns metabase.test.data.sql-jdbc
  "Common test extension functionality for SQL-JDBC drivers."
  (:require [metabase.driver :as driver]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]]
            [metabase.test.data.sql-jdbc.load-data :as load-data]))

(driver/register! :sql-jdbc/test-extensions, :abstract? true)

(sql.tx/add-test-extensions! :sql-jdbc/test-extensions)

(defn add-test-extensions! [driver]
  (driver/add-parent! driver :sql-jdbc/test-extensions)
  (println "Added SQL JDBC test extensions for" driver "➕"))

(defmethod tx/create-db! :sql-jdbc/test-extensions [& args]
  (apply load-data/create-db! args))
