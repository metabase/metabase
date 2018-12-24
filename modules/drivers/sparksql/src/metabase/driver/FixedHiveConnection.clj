(ns metabase.driver.FixedHiveConnection
  (:import [org.apache.hive.jdbc HiveConnection]
           [java.sql ResultSet SQLException]
           java.util.Properties)
  (:gen-class
   :extends org.apache.hive.jdbc.HiveConnection
   :init init
   :constructors {[String java.util.Properties] [String java.util.Properties]}))

(defn -init
  "Initializes the connection"
  [uri properties]
  [[uri properties] nil])

(defn -getHoldability
  "Returns the holdability setting for this JDBC driver"
  [^org.apache.hive.jdbc.HiveConnection this]
  ResultSet/CLOSE_CURSORS_AT_COMMIT)

(defn -setReadOnly
  "Sets this connection to read only"
  [^org.apache.hive.jdbc.HiveConnection this read-only?]
  (when (.isClosed this)
    (throw (SQLException. "Connection is closed")))
  (when read-only?
    (throw (SQLException. "Enabling read-only mode is not supported"))))
