(ns metabase.driver.sql-jdbc.sync.dbms-version
  (:require
   [clojure.java.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn dbms-version
  "Default implementation of `driver/dbms-version` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [_driver jdbc-spec]
  (jdbc/with-db-metadata [metadata jdbc-spec]
    {:flavor (.getDatabaseProductName metadata)
     :version (.getDatabaseProductVersion metadata)
     :semantic-version [(.getDatabaseMajorVersion metadata)
                        (.getDatabaseMinorVersion metadata)]}))
