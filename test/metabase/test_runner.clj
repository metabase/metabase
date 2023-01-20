(ns metabase.test-runner
  "Simple wrapper to let us use eftest with the Clojure CLI. Pass `:only` to specify where to look for tests (see dox
  for [[find-tests]] for more info.)"
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :as t]
   [clojure.tools.namespace.find :as ns.find]
   [eftest.report.pretty]
   [eftest.report.progress]
   [eftest.runner]
   [environ.core :as env]
   [humane-are.core :as humane-are]
   [metabase.config :as config]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.test-runner.init :as test-runner.init]
   [metabase.test-runner.junit :as test-runner.junit]
   [metabase.test-runner.parallel :as test-runner.parallel]
   [metabase.test.data.env :as tx.env]
   [metabase.test.redefs]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n.impl :as i18n.impl]
   [pjstadig.humane-test-output :as humane-test-output]))

;; Initialize Humane Test Output if it's not already initialized. Don't enable humane-test-output when running tests
;; from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;;; Same for https://github.com/camsaul/humane-are
(humane-are/install!)

;; Load redefinitions of stuff like `tt/with-temp` and `with-redefs` that throw an Exception when they are used inside
;; parallel tests.
(comment metabase.test.redefs/keep-me
  test-runner.assert-exprs/keep-me
  ;; these are necessary so data_readers.clj functions can function
  u.date/keep-me
  i18n.impl/keep-me)

;; Disable parallel tests with `PARALLEL=false`
(def ^:private enable-parallel-tests?
  (if-let [^String s (env/env :parallel)]
    (Boolean/parseBoolean s)
    true))

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
    (->> (ns.find/find-namespaces-in-dir file)
         (filter #(re-matches #"^metabase.*test$" (name %)))
         (mapcat find-tests))))

(def ^:dynamic *exclude-tags* #{})

;; a test namespace or individual test
(defmethod find-tests clojure.lang.Symbol
  [symb]
  (letfn [(load-test-namespace [ns-symb]
            (binding [test-runner.init/*test-namespace-being-loaded* ns-symb]
              (require ns-symb)))]
    (if-let [symbol-namespace (some-> (namespace symb) symbol)]
      ;; a actual test var e.g. `metabase.whatever-test/my-test`
      (do
        (load-test-namespace symbol-namespace)
        [(or (resolve symb)
             (throw (ex-info (format "Unable to resolve test named %s" symb) {:test-symbol symb})))])
      ;; a namespace e.g. `metabase.whatever-test`
      (do
        (load-test-namespace symb)
        (let [ns-tags (-> symb find-ns meta keys set)
              ex-tags (set/intersection *exclude-tags* ns-tags)]
          (if (seq ex-tags)
            (println (format
                      "Skipping tests in `%s` due to exclusion-tag(s): %s"
                      symb
                      (->> ex-tags sort (str/join ","))))
            (eftest.runner/find-tests symb)))))))

;; default -- look in all dirs on the classpath
(defmethod find-tests nil
  [_]
  (find-tests (classpath/system-classpath)))

(defn tests [{:keys [only exclude-tags]}]
  (when only
    (println "Running tests in" (pr-str only)))
  (let [start-time-ms (System/currentTimeMillis)
        tests         (binding [*exclude-tags* (-> exclude-tags u/one-or-many set)]
                        (into [] (find-tests only)))]
    (printf "Finding tests took %s.\n" (u/format-milliseconds (- (System/currentTimeMillis) start-time-ms)))
    (println "Running" (count tests) "tests")
    tests))

(comment
  ;; Example of using :exclude-tags
  ;; Has no effect as there are no :exclude-tags on 'metabase.api.notify-test
  (tests {:only ['metabase.api.notify-test] :exclude-tags [:mb/once]})
  ;; Just run these tests
  (tests {:only ['metabase.sync-test]})
  ;; Excluded since metabase.sync-test has the ^:mb/once tag
  (tests {:only ['metabase.sync-test] :exclude-tags [:mb/once]})
  ;; Or maybe you want to exclude deprecated nses.
  ;; The notify-tests will show, but sync-test will not.
  (tests {:only ['metabase.api.notify-test
                 'metabase.sync-test] :exclude-tags [:deprecated]})
  )

;;;; Running tests & reporting the output

(defonce ^:private orig-test-var t/test-var)

(def ^:private ^:dynamic *parallel-test-counter*
  nil)

(defn run-test
  "Run a single test `test-var`. Wraps/replaces [[clojure.test/test-var]]."
  [test-var]
  (binding [test-runner.parallel/*parallel?* (test-runner.parallel/parallel? test-var)]
    (some-> *parallel-test-counter* (swap! update
                                           (if (and test-runner.parallel/*parallel?* enable-parallel-tests?)
                                             :parallel
                                             :single-threaded)
                                           (fnil inc 0)))
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
      (test-runner.junit/handle-event! event)
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
   (when-not (every? var? test-vars)
     (throw (ex-info "Invalid test vars" {:test-vars test-vars, :options options})))
   ;; don't randomize test order for now please, thanks anyway
   (with-redefs [eftest.runner/deterministic-shuffle (fn [_ test-vars] test-vars)]
     (binding [*parallel-test-counter* (atom {})]
       (merge
        (eftest.runner/run-tests
         test-vars
         (merge
          {:capture-output? false
           :multithread?    (when enable-parallel-tests? :vars)
           :report          (reporter)}
          options))
        @*parallel-test-counter*)))))

;;;; `clojure -X` entrypoint

(defn run-tests
  "`clojure -X` entrypoint for the test runner. `options` are passed directly to `eftest`; see
  https://github.com/weavejester/eftest for full list of options.

  To use our test runner from the REPL, use [[run]] instead."
  [options]
  (let [start-time-ms (System/currentTimeMillis)
        summary       (run (tests options) options)
        fail?         (pos? (+ (:error summary) (:fail summary)))]
    (pprint/pprint summary)
    (printf "Ran %d tests in parallel, %d single-threaded.\n" (:parallel summary 0) (:single-threaded summary 0))
    (printf "Finding and running tests took %s.\n" (u/format-milliseconds (- (System/currentTimeMillis) start-time-ms)))
    (println (if fail? "Tests failed." "All tests passed."))
    (System/exit (if fail? 1 0))))
