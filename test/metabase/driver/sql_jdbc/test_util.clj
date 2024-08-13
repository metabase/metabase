(ns metabase.driver.sql-jdbc.test-util
  (:require
   [metabase.driver :as driver]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]))

(defn sql-jdbc-drivers
  "Set of drivers descending from `:sql-jdbc` for test purposes."
  []
  (set
   (for [driver (tx.env/test-drivers)
         :when  (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver :sql-jdbc))]
     (tx/the-driver-with-test-extensions driver))))

(defn normal-sql-jdbc-drivers
  []
  (apply disj (sql-jdbc-drivers) qp.test-util/abnormal-drivers))
