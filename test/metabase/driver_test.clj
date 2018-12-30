(ns metabase.driver-test
  (:require [expectations :refer :all]
            [metabase.driver :as driver]))

(driver/register! ::test-driver)

(defmethod driver/available? ::test-driver [_] false)

(defmethod driver/supports? [::test-driver :foreign-keys] [_ _] true)

;; driver-supports?

(expect true  (driver/supports? ::test-driver :foreign-keys))
(expect false (driver/supports? ::test-driver :expressions))

;; expected namespace for a non-namespaced driver should be `metabase.driver.<driver>`
(expect
  'metabase.driver.sql-jdbc
  (#'driver/driver->expected-namespace :sql-jdbc))

;; for a namespaced driver it should be the namespace of the keyword
(expect
  'metabase.driver-test
  (#'driver/driver->expected-namespace ::toucans))
