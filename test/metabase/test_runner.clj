(ns metabase.test-runner
  "Simple wrapper to let us use eftest with the Clojure CLI. Pass `:only` to specify where to look for tests (see dox
  for [[find-tests]] for more info.)"
  (:require [clojure.java.classpath :as classpath]
            [clojure.java.io :as io]
            [clojure.pprint :as pprint]
            [clojure.test :as t]
            [clojure.tools.namespace.find :as ns-find]
            eftest.report.pretty
            eftest.report.progress
            eftest.runner
            [environ.core :as env]
            [metabase.config :as config]
            [metabase.test-runner.effects :as effects]
            [metabase.test-runner.init :as init]
            [metabase.test-runner.junit :as junit]
            [metabase.test-runner.parallel :as parallel]
            [metabase.test.data.env :as tx.env]
            metabase.test.redefs
            [pjstadig.humane-test-output :as humane-test-output]))

;; initialize Humane Test Output if it's not already initialized.
(humane-test-output/activate!)

;; Load redefinitions of stuff like `tt/with-temp` and `with-redefs` that throw an Exception when they are used inside
;; parallel tests.
(comment metabase.test.redefs/keep-me
         effects/keep-me)

;;;; Finding tests

(defmulti find-tests
  "Find test vars in `arg`, which can be a string directory name, symbol naming a specific namespace or test, or a
  collection of one or more of the above."
  {:arglists '([arg])}
  type)

;; collection of one of the things below
(defmethod find-tests clojure.lang.Sequential
  [coll]
  (mapcat find-tests coll))

;; directory name
(defmethod find-tests String
  [dir-name]
  (find-tests (io/file dir-name)))

(def ^:private excluded-directories
  "When searching the classpath for tests (i.e., if no `:only` options were passed), don't look for tests in any
  directories with these name (as the last path component)."
  #{"src"
    "test_config"
    "resources"
    "test_resources"
    "resources-ee"
    "classes"})

;; directory
(defmethod find-tests java.io.File
  [^java.io.File file]
  (when (and (.isDirectory file)
             (not (some (partial = (.getName file)) excluded-directories))
             (if-let [[_ driver] (re-find #"modules/drivers/([^/]+)/" (str file))]
               (contains? (tx.env/test-drivers) (keyword driver))
               true))
    (println "Looking for test namespaces in directory" (str file))
    (->> (ns-find/find-namespaces-in-dir file)
         (filter #(re-matches  #"^metabase.*test$" (name %)))
         (mapcat find-tests))))

;; a test namespace or individual test
(defmethod find-tests clojure.lang.Symbol
  [symb]
  (letfn [(load-test-namespace [ns-symb]
            (binding [init/*test-namespace-being-loaded* ns-symb]
              (require ns-symb)))]
    (if-let [symbol-namespace (some-> (namespace symb) symbol)]
      ;; a actual test var e.g. `metabase.whatever-test/my-test`
      (do
        (load-test-namespace symbol-namespace)
        [(resolve symb)])
      ;; a namespace e.g. `metabase.whatever-test`
      (do
        (load-test-namespace symb)
        (eftest.runner/find-tests symb)))))

;; default -- look in all dirs on the classpath
(defmethod find-tests nil
  [_]
  (find-tests (classpath/system-classpath)))

(defn tests [{:keys [only]}]
  (when only
    (println "Running tests in" (pr-str only)))
  (let [tests (find-tests only)]
    (println "Running" (count tests) "tests")
    tests))

;;;; Running tests & reporting the output

(defonce ^:private orig-test-var t/test-var)

(defn run-test
  "Run a single test `test-var`. Wraps/replaces [[clojure.test/test-var]]."
  [test-var]
  (binding [parallel/*parallel?* (parallel/parallel? test-var)]
    (orig-test-var test-var)))

(alter-var-root #'t/test-var (constantly run-test))

(defn- reporter
  "Create a new test reporter/event handler, a function with the signature `(handle-event event)` that gets called once
  for every [[clojure.test]] event, including stuff like `:begin-test-run`, `:end-test-var`, and `:fail`."
  []
  (let [stdout-reporter (if (or (env/env :ci) config/is-dev?)
                          eftest.report.pretty/report
                          eftest.report.progress/report)]
    (fn handle-event [event]
      (junit/handle-event! event)
      (stdout-reporter event))))

(defn run
  "Run `test-vars` with `options`, which are passed directly to [[eftest.runner/run-tests]].

    ;; run tests in a single namespace
    (run (find-tests 'metabase.bad-test))

    ;; run tests in a directory
    (run (find-tests \"test/metabase/query_processor_test\"))"
  ([test-vars]
   (run test-vars nil))

  ([test-vars options]
   ;; don't randomize test order for now please, thanks anyway
   (with-redefs [eftest.runner/deterministic-shuffle (fn [_ test-vars] test-vars)]
     (eftest.runner/run-tests
      test-vars
      (merge
       {:capture-output? false
        ;; parallel tests disabled for the time being -- some tests randomly fail if the data warehouse connection pool
        ;; gets nuked by a different thread. Once we fix that we can re-enable parallel tests.
        :multithread?    false #_:vars
        :report          (reporter)}
       options)))))

;;;; `clojure -X` entrypoint

(defn run-tests
  "`clojure -X` entrypoint for the test runner. `options` are passed directly to `eftest`; see
  https://github.com/weavejester/eftest for full list of options.

  To use our test runner from the REPL, use [[run]] instead."
  [options]
  (let [summary (run (tests options) options)
        fail?   (pos? (+ (:error summary) (:fail summary)))]
    (pprint/pprint summary)
    (println (if fail? "Tests failed." "All tests passed."))
    (System/exit (if fail? 1 0))))
