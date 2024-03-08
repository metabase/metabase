(ns metabase.driver.druid-jdbc
  (:require
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [next.jdbc]))

(set! *warn-on-reflection* true)

(driver/register! :druid-jdbc :parent :sql-jdbc)

(defmethod sql-jdbc.conn/connection-details->spec :druid-jdbc
  [_driver _db-details]
  {:connection-uri "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true"})

(comment
  (driver/can-connect? :druid-jdbc nil)

  (def x (next.jdbc/get-connection "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true"))
  (type x)
  (instance? java.sql.Connection x)
  (.getMetaData x)
  (instance? java.sql.DatabaseMetaData (.getMetaData x))
  (-> (.getMetaData x) .getURL)
  )
