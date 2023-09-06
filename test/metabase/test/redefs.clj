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
       :private true}
  *in-with-temp* false)

(methodical/defmethod t2.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff. Make sure metabase.test.util is loaded.
  Make sure the the "
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)

  ;; run `f` in a transaction if it's the top-level with-temp
  (if-not *in-with-temp*
    (binding [*in-with-temp* true]
      (t2.connection/with-transaction [_]
        (next-method model attributes f)))
    (next-method model attributes f)))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
