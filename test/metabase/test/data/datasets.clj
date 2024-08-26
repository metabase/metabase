(ns metabase.test.data.datasets
  "Utility functions and macros for running tests against multiple drivers. When writing a test, you normally define all
  the drivers it *can* run against, e.g.

    (deftest my-test
      ;; run tests against all drivers except Druid
      (mt/test-drivers (mt/normal-drivers)
        ...))

  When the test suite is ran, those tests will be ran against the subset of those drivers that are present in the
  `DRIVERS` env var.

  TODO - this namespace name really doesn't make a lot of sense. How about `metabase.test.driver` or something like
  that?
  Tech debt issue: #39348"
  (:require
   [clojure.test :as t]
   [colorize.core :as colorize]
   [metabase.driver :as driver]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]))

(defn -test-driver
  "Impl for [[test-driver]]."
  [driver thunk]
  (when (contains? (tx.env/test-drivers) driver)
    (t/testing (str "\n" (colorize/cyan driver) "\n")
      (driver/with-driver (tx/the-driver-with-test-extensions driver)
        (thunk)))))

(defmacro test-driver
  "Like [[test-drivers]], but for a single driver."
  {:style/indent :defn}
  [driver & body]
  `(-test-driver ~driver (^:once fn* [] ~@body)))

(defmacro test-drivers
  "Execute body (presumably containing tests) against the drivers in `drivers` that  we're currently testing against
  (i.e., if they're listed in the env var `DRIVERS`)."
  {:style/indent :defn}
  [drivers & body]
  `(doseq [driver# ~drivers]
     (test-driver driver#
       ~@body)))
