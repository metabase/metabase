(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [mb.hawk.parallel]
   [metabase.classloader.core :as classloader]
   [metabase.test.util.thread-local :as tu.thread-local]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.tools.with-temp]))

(def ^:dynamic ^:private *in-with-temp*
  "Used to detect whether we're in a nested [[with-temp]]. Default is false."
  false)

(defn- do-with-appdb-search-state-resync
  "Run `thunk`; if it changed the in-memory appdb search index state store, re-sync that store to committed
  metadata afterward.

  A top-level [[with-temp]] body runs inside a transaction that is then rolled back. If that body (re)builds or
  rotates the appdb search index -- e.g. synchronous ingestion triggering `ensure-ready!`/`reset-index!` -- the
  table DDL is rolled back with the transaction, but the search state store is an in-memory atom that survives
  the rollback. It would then keep pointing at a table that no longer exists, so every later test's ingestion
  upserts into a missing relation, aborting the statement and poisoning the pooled connection (the failure then
  surfaces in some unrelated test as \"current transaction is aborted\"). Re-syncing to committed metadata drops
  the stale pointer.

  No-op, and no DB access, unless the search index namespace is loaded, the store is db-backed (i.e. not a
  with-temp-index-table mock), and the body actually mutated the in-memory state."
  [thunk]
  (let [store         (some-> (find-ns 'metabase.search.appdb.index) (ns-resolve '*state-store*) deref)
        db-backed?    (some-> (find-ns 'metabase.search.appdb.index-state) (ns-resolve 'db-backed?))
        snapshot      (some-> (find-ns 'metabase.search.appdb.index) (ns-resolve 'state-snapshot))
        force-refresh (some-> (find-ns 'metabase.search.appdb.index-state) (ns-resolve 'force-refresh!))
        track?        (boolean (and store db-backed? snapshot force-refresh (db-backed? store)))
        before        (when track? (snapshot))]
    (try
      (thunk)
      (finally
        (when (and track? (not= before (snapshot)))
          (force-refresh store))))))

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
      (do-with-appdb-search-state-resync
       (fn []
         (t2.connection/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
           (next-method model attributes f)))))
    (next-method model attributes f)))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
