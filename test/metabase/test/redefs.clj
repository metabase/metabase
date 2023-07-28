(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [mb.hawk.parallel]
   [metabase.plugins.classloader :as classloader]
   [methodical.core :as methodical]
   [toucan2.tools.with-temp :as t2.with-temp]))

(methodical/defmethod t2.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff. Make sure metabase.test.util is loaded. Make sure we are
  not inside a parallel test."
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; disallow with-temp inside parallel tests.
  ;;
  ;; TODO -- there's not really a reason that we can't use with-temp in parallel tests -- it depends on the test -- so
  ;; once we're a little more comfortable with the current parallel stuff we should remove this restriction.
  (mb.hawk.parallel/assert-test-is-not-parallel "with-temp")
  (next-method model attributes f))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
