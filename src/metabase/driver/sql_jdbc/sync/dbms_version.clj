(ns metabase.driver.sql-jdbc.sync.dbms-version
  (:require
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]))

(set! *warn-on-reflection* true)

(defn dbms-version
  "Default implementation of `driver/dbms-version` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver jdbc-spec]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   jdbc-spec
   nil
   (fn [^java.sql.Connection conn]
     (let [metadata (.getMetaData conn)]
       {:flavor           (.getDatabaseProductName metadata)
        :version          (.getDatabaseProductVersion metadata)
        :semantic-version [(.getDatabaseMajorVersion metadata)
                           (.getDatabaseMinorVersion metadata)]}))))
