(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [mb.hawk.parallel]
   [metabase.plugins.classloader :as classloader]
   [metabase.test.util.thread-local :as tu.thread-local]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:dynamic ^:private *in-tx*
  "Used to detect whether we're in a nested [[with-temp]]. Default is false."
  false)

(methodical/defmethod t2.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff.
  Make sure metabase.test.util is loaded.
  Run [[f]] in transaction by default, bind [[tu.thread-local/*thread-local*]] to false to disable this."
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; run `f` in a transaction if it's the top-level with-temp
  (if (and tu.thread-local/*thread-local* (not *in-tx*))
    (binding [*in-tx* true]
      (t2.connection/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
        (next-method model attributes f)))
    (next-method model attributes f)))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
