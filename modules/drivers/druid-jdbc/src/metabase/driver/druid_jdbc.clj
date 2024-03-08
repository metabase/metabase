(ns metabase.driver.druid-jdbc
  (:require
   [metabase.driver :as driver]
   [next.jdbc]))

(set! *warn-on-reflection* true)

(driver/register! :druid-jdbc :parent :sql-jdbc)

;; First query snippet based on `query data` exmaple in
;; https://druid.apache.org/docs/latest/api-reference/sql-jdbc
(comment
  (def query "SELECT __time, isRobot, countryName, comment FROM wikipedia WHERE countryName='Japan'")
  (def c (next.jdbc/get-connection "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true"))
  (next.jdbc/execute! c [query])
  (.close ^java.sql.Connection c)
  (.isClosed c)
  )
