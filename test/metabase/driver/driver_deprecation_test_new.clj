(ns metabase.driver.driver-deprecation-test-new
  "Dummy driver for driver deprecation testing (new driver)"
  (:require
   [metabase.driver :as driver]))

(driver/register! :driver-deprecation-test-new, :parent :sql)
