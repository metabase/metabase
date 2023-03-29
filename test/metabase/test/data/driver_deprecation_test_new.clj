(ns metabase.test.data.driver-deprecation-test-new
  "Dummy namespace for driver deprecation testing \"new\" driver, test data."
  (:require
   [metabase.test.data.sql :as sql.tx]))

(sql.tx/add-test-extensions! :driver-deprecation-test-new)
