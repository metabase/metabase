(ns metabase.test.data.datasets
  "Interface + implementations for loading test datasets for different drivers, and getting information about the dataset's tables, fields, etc."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [expectations :refer [expect]]
            [metabase.driver :as driver]))

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
    (some->> (s/split env-engines #",")
             (map keyword)
             ;; Double check that the specified datasets are all valid
             (map (fn [engine]
                    (assert (contains? all-valid-engines engine)
                      (format "Invalid dataset specified in ENGINES: %s" (name engine)))
                    engine))
             set)))

(def ^:const test-engines
  "Set of names of drivers we should run tests against.
   By default, this only contains `:h2` but can be overriden by setting env var `ENGINES`."
  (let [engines (or (get-engines-from-env)
                    #{:h2})]
    (log/info (color/green "Running QP tests against these engines: " engines))
    engines))


;; # Helper Macros

(def ^:private ^:const default-engine
  (if (contains? test-engines :h2) :h2
      (first test-engines)))

(def ^:dynamic *engine*
  "Keyword name of the engine that we're currently testing against. Defaults to `:h2`."
  default-engine)

(def ^:dynamic *data-loader*
  "The dataset we're currently testing against, bound by `with-engine`.
   This is just a regular driver, e.g. `MySQLDriver`, with an extra promise keyed by `:dbpromise`
   that is used to store the `test-data` dataset when you call `load-data!`."
  (driver/engine->driver default-engine))

(defn do-with-engine [engine f]
  (binding [*engine*      engine
            *data-loader* (driver/engine->driver engine)]
    (f)))

(defmacro with-engine
  "Bind `*data-loader*` to the dataset with ENGINE and execute BODY."
  [engine & body]
  `(do-with-engine ~engine (fn [] ~@body)))

(defmacro when-testing-engine
  "Execute BODY only if we're currently testing against ENGINE."
  [engine & body]
  `(when (contains? test-engines ~engine)
     ~@body))

(defmacro with-engine-when-testing
  "When testing ENGINE, binding `*data-loader*` and executes BODY."
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
  "Generate a unit test that only runs if we're currently testing against ENGINE, and that binds `*data-loader*` to the current dataset."
  [engine expected actual]
  `(expect-when-testing-engine ~engine
     (with-engine ~engine ~expected)
     (with-engine ~engine ~actual)))

(defmacro expect-with-engines
  "Generate unit tests for all datasets in ENGINES; each test will only run if we're currently testing the corresponding dataset.
   `*data-loader*` is bound to the current dataset inside each test."
  [engines expected actual]
  ;; Make functions to get expected/actual so the code is only compiled one time instead of for every single driver
  ;; speeds up loading of metabase.driver.query-processor-test significantly
  (let [e (gensym "expected-")
        a (gensym "actual-")]
    `(let [~e (fn [] ~expected)
           ~a (fn [] ~actual)]
       ~@(for [engine (eval engines)]
           `(expect-when-testing-engine ~engine
              (do-with-engine ~engine ~e)
              (do-with-engine ~engine ~a))))))

(defmacro expect-with-all-engines
  "Generate unit tests for all valid datasets; each test will only run if we're currently testing the corresponding dataset.
  `*data-loader*` is bound to the current dataset inside each test."
  [expected actual]
  `(expect-with-engines all-valid-engines ~expected ~actual))

(defmacro engine-case
  "Case statement that switches off of the current dataset.

     (engine-case
       :h2       ...
       :postgres ...)"
  [& pairs]
  `(cond ~@(mapcat (fn [[engine then]]
                     (assert (contains? all-valid-engines engine))
                     [`(= *engine* ~engine)
                      then])
                   (partition 2 pairs))))

;;; Load metabase.test.data.* namespaces for all available drivers
(doseq [[engine _] (driver/available-drivers)]
  (let [driver-test-namespace (symbol (str "metabase.test.data." (name engine)))]
    (require driver-test-namespace)))
