(ns metabase.test-runner.parallel
  "Code related to running parallel tests, and utilities for disallowing dangerous stuff inside them."
  (:require [clojure.test :as t]
            eftest.runner))

(defn parallel?
  "Whether `test-var` can be ran in parallel with other parallel tests."
  [test-var]
  (let [metta (meta test-var)]
    (or (:parallel metta)
        (:parallel (-> metta :ns meta)))))

(def ^:private synchronized? (complement parallel?))

(alter-var-root #'eftest.runner/synchronized? (constantly synchronized?))

(def ^:dynamic *parallel?*
  "Whether test currently being ran is being ran in parallel."
  nil)

(defn assert-test-is-not-parallel
  "Throw an exception if we are inside a `^:parallel` test."
  [disallowed-message]
  (when *parallel?*
    (let [e (ex-info (format "%s is not allowed inside parallel tests." disallowed-message) {})]
      (t/is (throw e)))))
