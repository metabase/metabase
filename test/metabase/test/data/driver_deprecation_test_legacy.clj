(ns metabase.test.data.driver-deprecation-test-legacy
  "Dummy namespace for driver deprecation testing \"legacy\" driver, test data."
  (:require
   [metabase.test.data.sql :as sql.tx]))

(sql.tx/add-test-extensions! :driver-deprecation-test-legacy)
