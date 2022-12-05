(ns metabase.driver.sql-jdbc.sync.dbms-version
  (:require [clojure.java.jdbc :as jdbc]))

(defn dbms-version
  "Default implementation of `driver/dbms-version` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [_driver jdbc-spec]
  (jdbc/with-db-metadata [metadata jdbc-spec]
    {:flavor (.getDatabaseProductName metadata)
     :version (.getDatabaseProductVersion metadata)
     :semantic-version [(.getDriverMajorVersion metadata)
                        (.getDriverMinorVersion metadata)]
     :driver-name (.getDriverName metadata)
     :driver-version (.getDriverVersion metadata)}))
