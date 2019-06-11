(ns metabase.driver-test
  (:require [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.plugins.classloader :as classloader]))

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

;; calling `the-driver` should set the context classloader, important because driver plugin code exists there but not
;; elsewhere
(expect
  @@#'classloader/shared-context-classloader
  (do
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (driver/the-driver :h2)
    (.getContextClassLoader (Thread/currentThread))))
