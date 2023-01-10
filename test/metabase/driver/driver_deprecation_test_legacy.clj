(ns metabase.driver.driver-deprecation-test-legacy
  "Dummy driver for driver deprecation testing (legacy driver)"
  (:require
   [metabase.driver :as driver]))

(driver/register! :driver-deprecation-test-legacy, :parent :sql)
