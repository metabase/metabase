(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require [metabase.plugins.classloader :as classloader]
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
  (classloader/require 'metabase.test-runner)
  ((resolve 'metabase.test-runner/assert-test-is-not-parallel) "with-temp")
  (apply orig-do-with-temp args))

(alter-var-root #'tt/do-with-temp (constantly do-with-temp))
