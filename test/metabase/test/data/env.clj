(ns metabase.test.data.env
  "Logic for determining which datasets to test against.

  By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which datasets to test
  against by setting the env var `DRIVERS` to a comma-separated list of dataset names, e.g.

    # test against :h2 and :mongo
    DRIVERS=h2,mongo

    # just test against :h2 (default)
    DRIVERS=h2"
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [metabase.test.data.env.impl :as impl]
            [metabase.test.initialize :as initialize]))

(defonce ^:private env-test-drivers
  (delay
    (let [drivers (impl/get-test-drivers)]
      (log/info (color/cyan "Running QP tests against these drivers: " drivers))
      (when-not (= drivers #{:h2})
        (initialize/initialize-if-needed! :plugins))
      drivers)))

(defonce ^:private default-test-drivers
  (atom nil))

(defn set-test-drivers!
  "Change the set of drivers that driver-based tests run against. Intended for REPL usage."
  [drivers]
  {:pre [((some-fn sequential? set?) drivers)]}
  (reset! default-test-drivers (set drivers)))

(def ^:private ^:dynamic *test-drivers*
  (fn []
    (or @default-test-drivers
        @env-test-drivers)))

(defn do-with-test-drivers [drivers thunk]
  {:pre [((some-fn sequential? set?) drivers)]}
  (binding [*test-drivers* (constantly (set drivers))]
    (thunk)))

(defmacro with-test-drivers
  "Temporarily change the set of drivers that driver-based tests run against. Intended for REPL usage."
  [drivers & body]
  `(do-with-test-drivers ~drivers (fn [] ~@body)))

(def ^{:arglists '([])} test-drivers
  "Set of keyword names of drivers we should run tests against. By default, this is `#{:h2}` but it can be
  overriden

  *  by setting env var `DRIVERS` when running tests from the command line or CI.

      DRIVERS=h2,mongo lein test

  *  temporarily from the REPL, by using the `with-test-drivers-macro`

      (with-test-drivers #{:postgres}
        (some-test))

  *  for the duration of a REPL session, by calling `set-test-drivers!`

      (set-test-drivers! #{:mysql :postgres})

  Note that this is merely the set of drivers test *can* run against; tests actually run against the union of the
  'test drivers' set and the set of drivers listed in the test itself. e.g.

    (deftest my-test
      ;; this will run against H2 if `(test-drivers)` contains `:h2`, and Postgres if `(test-drivers)` contains
      ;; `:postgres`
      (datasets/test-drivers #{:h2 :postgres}
        ..))

  NOTE - For historic reasons `test-drivers` can be dereffed a if it were a delay, even tho it is not. Using it this
  way should be considered deprecated — please invoke it as a function call instead."
  (reify
    clojure.lang.IDeref
    (deref [_]
      (*test-drivers*))
    clojure.lang.IFn
    (invoke [_]
      (*test-drivers*))))
