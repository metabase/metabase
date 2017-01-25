(ns metabase.test.data.datasets
  "Interface + implementations for loading test datasets for different drivers, and getting information about the dataset's tables, fields, etc."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [expectations :refer [expect]]
            (metabase [config :as config]
                      [driver :as driver]
                      [plugins :as plugins])
            [metabase.test.data.interface :as i]))

;; When running tests, we need to make sure plugins (i.e., the Oracle JDBC driver) are loaded because otherwise the Oracle driver won't show up in the list of valid drivers below
(plugins/load-plugins!)

(driver/find-and-load-drivers!)

(def ^:const all-valid-engines (set (keys (driver/available-drivers))))

;; # Logic for determining which datasets to test against

;; By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which
;; datasets to test against by setting the env var `ENGINES` to a comma-separated list of dataset names, e.g.
;;
;;    # test against :h2 and :mongo
;;    ENGINES=generic-sql,mongo
;;
;;    # just test against :h2 (default)
;;    ENGINES=generic-sql

(defn- get-engines-from-env
  "Return a set of dataset names to test against from the env var `ENGINES`."
  []
  (when-let [env-engines (some-> (env :engines) s/lower-case)]
    (set (for [engine (s/split env-engines #",")
               :when engine]
           (keyword engine)))))

(def ^:const test-engines
  "Set of names of drivers we should run tests against.
   By default, this only contains `:h2` but can be overriden by setting env var `ENGINES`."
  (let [engines (or (get-engines-from-env)
                    #{:h2})]
    (when config/is-test?
      (log/info (color/cyan "Running QP tests against these engines: " engines)))
    engines))


;; # Helper Macros

(def ^:private ^:const default-engine
  (if (contains? test-engines :h2) :h2
      (first test-engines)))

(def ^:dynamic *engine*
  "Keyword name of the engine that we're currently testing against. Defaults to `:h2`."
  default-engine)

(defn- engine->driver
  "Like `driver/engine->driver`, but reloads the relevant test data namespace as well if needed."
  [engine]
  (try (i/engine (driver/engine->driver engine))
       (catch IllegalArgumentException _
         (require (symbol (str "metabase.test.data." (name engine))) :reload)))
  (driver/engine->driver engine))

(def ^:dynamic *driver*
  "The driver we're currently testing against, bound by `with-engine`.
   This is just a regular driver, e.g. `MySQLDriver`, with an extra promise keyed by `:dbpromise`
   that is used to store the `test-data` dataset when you call `load-data!`."
  (driver/engine->driver default-engine))

(defn do-with-engine [engine f]
  (binding [*engine* engine
            *driver* (engine->driver engine)]
    (f)))

(defmacro with-engine
  "Bind `*driver*` to the dataset with ENGINE and execute BODY."
  [engine & body]
  `(do-with-engine ~engine (fn [] ~@body)))

(defmacro when-testing-engine
  "Execute BODY only if we're currently testing against ENGINE."
  [engine & body]
  `(when (contains? test-engines ~engine)
     ~@body))

(defmacro with-engine-when-testing
  "When testing ENGINE, binding `*driver*` and executes BODY."
  [engine & body]
  `(when-testing-engine ~engine
     (with-engine ~engine
       ~@body)))

(defmacro expect-when-testing-engine
  "Generate a unit test that only runs if we're currently testing against ENGINE."
  [engine expected actual]
  `(when-testing-engine ~engine
     (expect ~expected
       ~actual)))

(defmacro expect-with-engine
  "Generate a unit test that only runs if we're currently testing against ENGINE, and that binds `*driver*` to the current dataset."
  [engine expected actual]
  `(expect-when-testing-engine ~engine
     (with-engine ~engine ~expected)
     (with-engine ~engine ~actual)))

(defmacro expect-with-engines
  "Generate unit tests for all datasets in ENGINES; each test will only run if we're currently testing the corresponding dataset.
   `*driver*` is bound to the current dataset inside each test."
  [engines expected actual]
  ;; Make functions to get expected/actual so the code is only compiled one time instead of for every single driver
  ;; speeds up loading of metabase.driver.query-processor-test significantly
  (let [e (symbol (str "expected-" (hash expected)))
        a (symbol (str "actual-"   (hash actual)))]
    `(let [~e (fn [] ~expected)
           ~a (fn [] ~actual)]
       ~@(for [engine (eval engines)]
           `(expect-when-testing-engine ~engine
              (do-with-engine ~engine ~e)
              (do-with-engine ~engine ~a))))))

(defmacro expect-with-all-engines
  "Generate unit tests for all valid datasets; each test will only run if we're currently testing the corresponding dataset.
  `*driver*` is bound to the current dataset inside each test."
  [expected actual]
  `(expect-with-engines all-valid-engines ~expected ~actual))


;;; Load metabase.test.data.* namespaces for all available drivers
(doseq [[engine _] (driver/available-drivers)]
  (let [driver-test-namespace (symbol (str "metabase.test.data." (name engine)))]
    (when (find-ns driver-test-namespace)
      (require driver-test-namespace))))
