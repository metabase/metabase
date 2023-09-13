(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [mb.hawk.parallel]
   [metabase.plugins.classloader :as classloader]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^{:dynamic true
       :private true
       :doc     "Used to detect whether we're in a nested [[with-temp]]. Default is false."}
  *in-tx* false)

(def ^{:dynamic true
       :doc     "Used to control whether [[with-temp]] will run in a transaction. Default is true."}
  *with-temp-use-transaction* true)

(methodical/defmethod t2.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff.
  Make sure metabase.test.util is loaded.
  Run [[f]] in transaction by default, bind [[*with-temp-use-transaction*]] to false to disable this."
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)

  ;; run `f` in a transaction if it's the top-level with-temp
  (if (and *with-temp-use-transaction* (not *in-tx*))
    (binding [*in-tx* true]
      (t2.connection/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
        (next-method model attributes f)))
    (next-method model attributes f)))

(defmacro with-temp!
  "Like [[mt/with-temp]] but does not run body in a transaction that will rollback at the end.
  Can be used for cases where we test stuffs that can't be on the same thread.

  An example is tests that make real http call with [[mt/user-real-request]]."
  [& args]
  `(binding [*with-temp-use-transaction* false]
     (t2.with-temp/with-temp ~@args)))

(defmacro with-ensure-with-temp-no-transaction!
  "Run body with [[*with-temp-use-transaction*]] bound to false, ensuring all nested [[mt/with-temp]] will not rln in a transaction."
  [& body]
  `(binding [*with-temp-use-transaction* false]
     ~@body))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
