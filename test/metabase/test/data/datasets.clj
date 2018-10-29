(ns metabase.test.data.datasets
  "Interface + implementations for loading test datasets for different drivers, and getting information about the
  dataset's tables, fields, etc."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [expectations :refer [expect]]
            [metabase
             [config :as config]
             [driver :as driver]
             [plugins :as plugins]]
            [metabase.test.data.interface :as i]))

;; When running tests, we need to make sure plugins (i.e., the Oracle JDBC driver) are loaded because otherwise the
;; Oracle driver won't show up in the list of valid drivers below
(plugins/load-plugins!)

(def all-possible-driver-names (set (driver/possible-driver-names)))

;; # Logic for determining which datasets to test against

;; By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which
;; datasets to test against by setting the env var `ENGINES` to a comma-separated list of dataset names, e.g.
;;
;;    # test against :h2 and :mongo
;;    ENGINES=generic-sql,mongo
;;
;;    # just test against :h2 (default)
;;    ENGINES=generic-sql

(defn- get-driver-names-from-env
  "Return a set of driver names to test against from the env var `ENGINES`."
  []
  (when-let [env-driver-names (some-> (env :engines) s/lower-case)]
    (set (for [engine (s/split env-driver-names #",")
               :when engine]
           (keyword engine)))))

(def test-driver-names
  "Set of names of drivers we should run tests against.
   By default, this only contains `:h2` but can be overriden by setting env var `ENGINES`."
  (let [driver-names (or (get-driver-names-from-env)
                         #{:h2})]
    (when config/is-test?
      (log/info (color/cyan "Running QP tests against these driver-names: " driver-names)))

    (when-not (every? all-possible-driver-names driver-names)
      (throw (Exception.
              (format "Testing on '%s', but the following drivers are not available '%s'"
                      driver-names (set (remove all-possible-driver-names driver-names))))))
    driver-names))


;; # Helper Macros

(def ^:private ^:const default-engine
  (if (contains? test-driver-names :h2) :h2
      (first test-driver-names)))

(def ^:dynamic *engine*
  "Keyword name of the engine that we're currently testing against. Defaults to `:h2`."
  default-engine)

(defn- engine->test-extensions-ns-symbol
  "Return the namespace where we'd expect to find test extensions for the driver with ENGINE keyword.

     (engine->test-extensions-ns-symbol :h2) ; -> 'metabase.test.data.h2"
  [engine]
  (symbol (str "metabase.test.data." (name engine))))

(defn- engine->driver
  "Like `driver/engine->driver`, but reloads the relevant test data namespace as well if needed."
  [engine]
  (try (i/engine (driver/engine->driver engine))
       (catch IllegalArgumentException _
         (println "Reloading test extensions: (require " (engine->test-extensions-ns-symbol engine) ":reload)")
         (require (engine->test-extensions-ns-symbol engine) :reload)))
  (driver/engine->driver engine))

(def ^:dynamic *driver*
  "The driver we're currently testing against, bound by `with-engine`.
   This is just a regular driver, e.g. `MySQLDriver`, with an extra promise keyed by `:dbpromise`
   that is used to store the `test-data` dataset when you call `load-data!`."
  (engine->driver default-engine))

(defn do-with-engine
  "Bind `*engine*` and `*driver*` as appropriate for ENGINE and execute F, a function that takes no args."
  {:style/indent 1}
  [engine f]
  {:pre [(keyword? engine)]}
  (binding [*engine* engine
            *driver* (engine->driver engine)]
    (f)))

(defmacro with-engine
  "Bind `*driver*` to the dataset with ENGINE and execute BODY."
  {:style/indent 1}
  [engine & body]
  `(do-with-engine ~engine (fn [] ~@body)))

(defn do-when-testing-engine
  "Call function F (always with no arguments) *only* if we are currently testing against ENGINE.
   (This does NOT bind `*driver*`; use `do-with-engine` if you want to do that.)"
  {:style/indent 1}
  [engine f]
  (when (contains? test-driver-names engine)
    (f)))

(defmacro when-testing-engine
  "Execute BODY only if we're currently testing against ENGINE.
   (This does NOT bind `*driver*`; use `with-engine-when-testing` if you want to do that.)"
  {:style/indent 1}
  [engine & body]
  `(do-when-testing-engine ~engine (fn [] ~@body)))

(defmacro with-engine-when-testing
  "When testing ENGINE, binding `*driver*` and executes BODY."
  {:style/indent 1}
  [engine & body]
  `(when-testing-engine ~engine
     (with-engine ~engine
       ~@body)))

(defmacro expect-with-engine
  "Generate a unit test that only runs if we're currently testing against ENGINE, and that binds `*driver*` to the
  driver for ENGINE."
  {:style/indent 1}
  [engine expected actual]
  `(when-testing-engine ~engine
     (expect
       (with-engine ~engine ~expected)
       (with-engine ~engine ~actual))))

(defmacro expect-with-engines
  "Generate unit tests for all datasets in ENGINES; each test will only run if we're currently testing the
  corresponding dataset. `*driver*` is bound to the current dataset inside each test."
  {:style/indent 1}
  [engines expected actual]
  ;; Make functions to get expected/actual so the code is only compiled one time instead of for every single driver
  ;; speeds up loading of metabase.driver.query-processor-test significantly
  (let [e (symbol (str "expected-" (hash expected)))
        a (symbol (str "actual-"   (hash actual)))]
    `(let [~e (fn [] ~expected)
           ~a (fn [] ~actual)]
       ~@(for [engine (eval engines)]
           `(when-testing-engine ~engine
              (expect
                (do-with-engine ~engine ~e)
                (do-with-engine ~engine ~a)))))))

(defmacro expect-with-all-engines
  "Generate unit tests for all valid datasets; each test will only run if we're currently testing the corresponding
  dataset. `*driver*` is bound to the current dataset inside each test."
  {:style/indent 0}
  [expected actual]
  `(expect-with-engines all-possible-driver-names ~expected ~actual))
