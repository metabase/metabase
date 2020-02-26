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
  that?"
  (:require [clojure.test :as t]
            [colorize.core :as colorize]
            [metabase.driver :as driver]
            [metabase.test.data
             [env :as tx.env]
             [interface :as tx]]))

(defn do-when-testing-driver
  "Call function `f` (always with no arguments) *only* if we are currently testing against `driver` (i.e., if `driver`
  is listed in the `DRIVERS` env var.)

  (This does NOT bind `*driver*`; use `driver/with-driver` if you want to do that.)"
  {:style/indent 1}
  [driver f]
  (when (contains? (tx.env/test-drivers) driver)
    (f)))

(defmacro when-testing-driver
  "Execute `body` only if we're currently testing against `driver`.
   (This does NOT bind `*driver*`; use `with-driver-when-testing` if you want to do that.)"
  {:style/indent 1}
  [driver & body]
  `(do-when-testing-driver ~driver (fn [] ~@body)))

(defn do-with-driver-when-testing [driver thunk]
  (when-testing-driver driver
    (driver/with-driver (tx/the-driver-with-test-extensions driver)
      (thunk))))

(defmacro with-driver-when-testing
  "When `driver` is specified in `DRIVERS` env var, binds `metabase.driver/*driver*` and executes `body`. The currently
  bound driver is used for calls like `(data/db)` and `(data/id)`."
  {:style/indent 1}
  [driver & body]
  `(do-with-driver-when-testing ~driver (fn [] ~@body)))

(defmacro test-driver
  "Like `test-drivers`, but for a single driver."
  {:style/indent 1}
  [driver & body]
  `(with-driver-when-testing ~driver
     (t/testing (str "\n" (colorize/cyan ~driver))
       ~@body)))

(defmacro test-drivers
  "Execute body (presumably containing tests) against the drivers in `drivers` that  we're currently testing against
  (i.e., if they're listed in the env var `DRIVERS`)."
  {:style/indent 1}
  [drivers & body]
  `(doseq [driver# ~drivers]
     (test-driver driver#
       ~@body)))

(defmacro ^:deprecated expect-with-drivers
  "Generate unit tests for all drivers in env var `DRIVERS`; each test will only run if we're currently testing the
  corresponding driver. `*driver*` is bound to the current driver inside each test.

  DEPRECATED: use `deftest` with `test-drivers` instead.

    (deftest my-test
      (datasets/test-drivers #{:h2 :postgres}
        (is (= ...))))"
  {:style/indent 1}
  [drivers expected actual]
  ;; Make functions to get expected/actual so the code is only compiled one time instead of for every single driver
  ;; speeds up loading of metabase.driver.query-processor-test significantly
  (let [symb (symbol (str "expect-with-drivers-" (hash &form)))]
    `(t/deftest ~symb
       (t/testing (str "\n" (format ~(str (name (ns-name *ns*)) ":%d") (:line (meta #'~symb))))
         (test-drivers ~drivers
           (t/is (~'expect= ~expected ~actual)))))))

(defmacro ^:deprecated expect-with-driver
  "Generate a unit test that only runs if we're currently testing against `driver`, and that binds `*driver*` when it
  runs.

  DEPRECATED: Use `deftest` with `test-driver` instead.

    (deftest my-test
      (datasets/test-driver :mysql
        (is (= ...))))"
  {:style/indent 1}
  [driver expected actual]
  `(expect-with-drivers [~driver] ~expected ~actual))

(defmacro test-all-drivers
  "Execute body (presumably containing tests) against all drivers we're currently testing against."
  {:style/indent 0}
  [& body]
  `(test-drivers (tx.env/test-drivers) ~@body))

(defmacro ^:deprecated expect-with-all-drivers
  "Generate unit tests for all drivers specified in env var `DRIVERS`. `*driver*` is bound to the current driver inside
  each test.

  DEPRECATED: Use `test-all-drivers` instead.

    (deftest my-test
      (datasets/test-all-drivers
        (is (= ...))))"
  {:style/indent 0}
  [expected actual]
  `(expect-with-drivers (tx.env/test-drivers) ~expected ~actual))
