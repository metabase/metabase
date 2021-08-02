(ns test-runner
  "Simple wrapper to let us use eftest with the Clojure CLI. Pass `:only` to specify where to look for tests (see dox
  for [[find-tests]] for more info.)"
  (:require [clojure.java.classpath :as classpath]
            [clojure.java.io :as io]
            [clojure.pprint :as pprint]
            [clojure.string :as str]
            [clojure.test :as t]
            [clojure.tools.namespace.find :as ns-find]
            eftest.report
            eftest.report.junit
            eftest.report.pretty
            eftest.report.progress
            eftest.runner
            [environ.core :as env]
            [metabase.db :as mdb]
            [metabase.test.data.env :as tx.env]
            metabase.test.redefs))

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
  "Run the tests associated with `varr`. Wraps original version in `clojure.test/test-var`.

    (test-var #'my.namespace/my-test)"
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

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))

(def ^:dynamic *junit-reporter-context* nil)

(defn- reporter []
  (let [junit-reporter  (eftest.report/report-to-file
                         eftest.report.junit/report
                         "target/junit/test.xml")
        stdout-reporter (if (env/env :ci)
                          eftest.report.pretty/report
                          eftest.report.progress/report)]
    (fn [m]
      (let [start (System/currentTimeMillis)]
        (binding [eftest.report/*context* *junit-reporter-context*
                  t/*report-counters*     nil]
          (junit-reporter m)))
      (stdout-reporter m))))

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

(defn run [tests options]
  (binding [*junit-reporter-context* (atom {})]
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
        options)))))

(defn run-tests [options]
  (let [summary (run (tests options) options)
        fail?   (pos? (+ (:error summary) (:fail summary)))]
    (pprint/pprint summary)
    (println (if fail? "Tests failed." "All tests passed."))
    (System/exit (if fail? 1 0))))
