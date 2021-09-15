(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.test-runner.parallel :as test-runner.parallel]
            [toucan.util.test :as tt]))

;; wrap `do-with-temp` so it initializes the DB before doing the other stuff it usually does

(defonce orig-do-with-temp tt/do-with-temp)

(defn do-with-temp [& args]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; disallow with-temp inside parallel tests.
  ;;
  ;; TODO -- there's not really a reason that we can't use with-temp in parallel tests -- it depends on the test -- so
  ;; once we're a little more comfortable with the current parallel stuff we should remove this restriction.
  (test-runner.parallel/assert-test-is-not-parallel "with-temp")
  ;; catch any Exceptions thrown by the original call and rethrow them with some extra context to make them a little
  ;; easier to debug.
  (try
    (apply orig-do-with-temp args)
    (catch Throwable e
      ;; only wrap the Exception with additional context if it's not already wrapped. We don't need a bunch of nested
      ;; `do-with-temp` calls that didn't fail wrapping the Exception from the one that did and adding a bunch of
      ;; noise
      (if (::with-temp-error (ex-data e))
        (throw e)
        (throw (ex-info (str "with-temp error: " (ex-message e))
                        {:args args, ::with-temp-error true}
                        e))))))

(alter-var-root #'tt/do-with-temp (constantly do-with-temp))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (test-runner.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
