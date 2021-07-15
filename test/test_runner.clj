(ns test-runner
  "Simple wrapper to let us use eftest with the Clojure CLI. Pass `:only` to specify where to look for tests -- args can
  be string(s) (denoting directories), symbol(s) denoting namespaces or individual tests, or keyword(s) denoting test
  selectors."
  (:require [clojure.pprint :as pprint]
            [clojure.test :as t]
            eftest.report
            eftest.report.junit
            eftest.report.pretty
            eftest.report.progress
            eftest.runner
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

(defn test-var [varr]
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
        stdout-reporter (if (System/getenv "CI")
                          eftest.report.pretty/report
                          eftest.report.progress/report)]
    (fn [m]
      (let [start (System/currentTimeMillis)]
        (binding [eftest.report/*context* *junit-reporter-context*
                  t/*report-counters*     nil]
          (junit-reporter m)))
      (stdout-reporter m))))

(defn tests [{:keys [only]}]
  (let [only       (if (sequential? only)
                     only
                     [only])
        _          (println "Running tests in" (pr-str only))
        tests      (mapcat eftest.runner/find-tests only)]
    (println "Running" (count tests) "tests")
    tests))

(defn run [tests options]
  (binding [*junit-reporter-context* (atom {})]
    (eftest.runner/run-tests
     tests
     (merge
      {:multithread? :vars
       :report       (reporter)}
      options))))

(defn run-tests [options]
  (let [summary (run (tests options) options)
        fail?   (pos? (+ (:error summary) (:fail summary)))]
    (pprint/pprint summary)
    (println (if fail? "Tests failed." "All tests passed."))
    (System/exit (if fail? 1 0))))
