(ns metabase.driver.sql-jdbc.test-util
  (:require [metabase.driver :as driver]
            [metabase.test.data
             [env :as tx.env]
             [interface :as tx]]))

(defn sql-jdbc-drivers
  "Set of drivers descending from `:sql-jdbc` for test purposes."
  []
  (set
   (for [driver (tx.env/test-drivers)
         :when  (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver :sql-jdbc))]
     (tx/the-driver-with-test-extensions driver))))
