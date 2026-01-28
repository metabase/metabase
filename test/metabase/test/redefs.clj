(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [mb.hawk.parallel]
   [metabase.classloader.core :as classloader]
   [metabase.test.util.thread-local :as tu.thread-local]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.with-temp]))

(def ^:dynamic ^:private *in-with-temp*
  "Used to detect whether we're in a nested [[with-temp]]. Default is false."
  false)

(methodical/defmethod toucan2.tools.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff.
  Make sure metabase.test.util is loaded.
  Run [[f]] in transaction by default, bind [[tu.thread-local/*thread-local*]] to false to disable this."
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; run `f` in a transaction if it's the top-level with-temp
  (if (and tu.thread-local/*thread-local* (not *in-with-temp*))
    (binding [*in-with-temp* true]
      (t2.connection/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
        (next-method model attributes f)))
    (next-method model attributes f)))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))

;;;; Disallow executing app DB queries as a side-effect of loading a namespace

(methodical/defmethod t2.pipeline/transduce-execute-with-connection :before :default
  "Disallow executing app DB queries as a side effect of loading a namespace."
  [_rf _conn _query-type _model compiled-query]
  ;; this seems to be the best way I could come up with to see if we're currently in the process of loading a namespace
  (when (seq @#'clojure.core/*pending-paths*)
    (throw (ex-info "Do not execute app DB queries as a side effect of loading a namespace (e.g., in a top-level `def`)."
                    {:query compiled-query, :path (first @#'clojure.core/*pending-paths*)})))
  compiled-query)
