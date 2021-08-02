(ns metabase.test-runner.junit
  (:require [clojure.test :as t]
            eftest.report
            eftest.report.junit))

(def ^:dynamic ^:private *reporter-context* nil)

(defn do-with-reporter-context [thunk]
  (binding [*reporter-context* (atom {})]
    (thunk)))

(defmacro with-reporter-context
  "Execute `body` with the context needed by the [[junit-reporter]] created and bound."
  [& body]
  `(do-with-reporter-context (fn [] ~@body)))

(defn junit-reporter
  "Create a new JUnit test reporter function of the form

    (reporter test-report-map)

  To use this reporter you must bind the reporter context with [[with-reporter-context]]; this should be done outside
  of the top-level test running loop (e.g. [[metabase.test-runner/run]])."
  []
  (let [reporter (eftest.report/report-to-file
                  eftest.report.junit/report
                  "target/junit/test.xml")]
    ;; called once with the report map for every test that's ran, as well as a few other events like
    ;; `:begin-test-run`.
    (fn junit-reporter-fn [test-report-map]
      (binding [eftest.report/*context* *reporter-context*
                t/*report-counters*     nil]
        (reporter test-report-map)))))
