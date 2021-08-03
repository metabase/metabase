(ns metabase.test-runner.parallel
  "Code related to running parallel tests, and utilities for disallowing dangerous stuff inside them."
  (:require [clojure.test :as t]
            eftest.runner))

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
