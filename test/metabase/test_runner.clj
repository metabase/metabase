(ns metabase.test-runner
  "Simple wrapper to let us use eftest with the Clojure CLI. Pass `:only` to specify where to look for tests (see dox
  for [[find-tests]] for more info.)"
  (:require [clojure.java.classpath :as classpath]
            [clojure.java.io :as io]
            [clojure.pprint :as pprint]
            [clojure.string :as str]
            [clojure.test :as t]
            [clojure.tools.namespace.find :as ns-find]
            eftest.report.pretty
            eftest.report.progress
            eftest.runner
            [environ.core :as env]
            [metabase.db :as mdb]
            [metabase.test-runner.junit :as junit]
            [metabase.test.data.env :as tx.env]
            metabase.test.redefs
            [pjstadig.humane-test-output :as humane-test-output]))

(humane-test-output/activate!)

(comment metabase.test.redefs/keep-me)

(defn- parallel? [test-var]
  (let [metta (meta test-var)]
    (or (:parallel metta)
        (:parallel (-> metta :ns meta)))))

(def ^:private synchronized? (complement parallel?))

(alter-var-root #'eftest.runner/synchronized? (constantly synchronized?))

(defonce orig-test-var t/test-var)

(def ^:dynamic *parallel?* nil)

(defn test-var
  "Run the tests associated with `varr`. Wraps original version in [[clojure.test/test-var]]. Not meant to be used
  directly; use [[run]] below instead."
  [varr]
  (binding [*parallel?* (parallel? varr)]
    (orig-test-var varr)))

(alter-var-root #'t/test-var (constantly test-var))

(defn assert-test-is-not-parallel
  "Throw an exception if we are inside a `^:parallel` test."
  [disallowed-message]
  (when *parallel?*
    (let [e (ex-info (format "%s is not allowed inside parallel tests." disallowed-message) {})]
      (t/is (throw e)))))

;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`
;;
;; TODO -- shouldn't this go in `metabase.test.redefs` with the other redefs?

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))

(defn- reporter []
  (let [stdout-reporter (if (env/env :ci)
                          eftest.report.pretty/report
                          eftest.report.progress/report)]
    ;; called once with the event for every test that's ran, as well as a few other events like
    ;; `:begin-test-run` or `:summary`
    (fn [event]
      (junit/handle-event! event)
      (stdout-reporter event))))

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

;; directory
(defmethod find-tests java.io.File
  [^java.io.File file]
  (when (and (.isDirectory file)
             (not (str/ends-with? "resources" (.getName file)))
             (not (str/ends-with? "classes" (.getName file)))
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
  (if (namespace symb)
    ;; a actual test var e.g. `metabase.whatever-test/my-test`
    [symb]
    ;; a namespace e.g. `metabase.whatever-test`
    (do
      (require symb)
      (eftest.runner/find-tests symb))))

;; default -- look in all dirs on the classpath
(defmethod find-tests nil
  [_]
  (find-tests (classpath/system-classpath)))

(defn tests [{:keys [only]}]
  (when only
    (println "Running tests in" (pr-str only)))
  (let [tests (with-redefs [mdb/setup-db! (fn []
                                            (throw (ex-info "Shouldn't be setting up the app DB as a side effect of loading test namespaces!" {})))]
                (find-tests only))]
    (println "Running" (count tests) "tests")
    tests))

(defn run
  "Run `tests`, a collection of test vars, with options. Options are passed directly to [[eftest.runner/run-tests]]."
  [tests options]
  ;; don't randomize test order for now please, thanks anyway
  (with-redefs [eftest.runner/deterministic-shuffle (fn [_ tests] tests)]
    (eftest.runner/run-tests
     tests
     (merge
      {:capture-output? false
       ;; parallel tests disabled for the time being -- some tests randomly fail if the data warehouse connection pool
       ;; gets nuked by a different thread. Once we fix that we can re-enable parallel tests.
       :multithread?    false #_:vars
       :report          (reporter)}
      options))))

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
