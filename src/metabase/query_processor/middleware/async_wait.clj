(ns metabase.query-processor.middleware.async-wait
  "Middleware that limits the number of concurrent queries for each database.

  Each connected database is limited to a maximum of 15 simultaneous queries (configurable) using these methods; any
  additional queries will park the thread. Super-useful for writing high-performance API endpoints. Prefer these
  methods to the old-school synchronous versions.

  How is this achieved? For each Database, we'll maintain a thread pool executor to limit the number of simultaneous
  queries."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.lang.Var
           [java.util.concurrent Executors ExecutorService]
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(defsetting max-simultaneous-queries-per-db
  (trs "Maximum number of simultaneous queries to allow per connected Database.")
  :type    :integer
  :default 15)

(defonce ^:private db-thread-pools (atom {}))

;; easier just to use a lock for creating the pools rather than using `swap-vals!` and having to nuke a bunch of
;; thread pools that ultimately don't get used
(defonce ^:private db-thread-pool-lock (Object.))

(defn- new-thread-pool ^ExecutorService [database-id]
  (Executors/newFixedThreadPool
   (max-simultaneous-queries-per-db)
   (.build
    (doto (BasicThreadFactory$Builder.)
      (.namingPattern (format "qp-database-%d-threadpool-%%d" database-id))
      ;; Daemon threads do not block shutdown of the JVM
      (.daemon true)
      ;; TODO - what should the priority of QP threads be? It seems like servicing general API requests should be
      ;; higher (?)
      ;; Stuff like Pulse sending and sync should definitely by MIN_PRIORITY (!)
      #_(.priority Thread/MIN_PRIORITY)))))

(s/defn ^:private db-thread-pool :- ExecutorService
  [database-or-id]
  (let [id (u/get-id database-or-id)]
    (or
     (@db-thread-pools id)
     (locking db-thread-pool-lock
       (or
        (@db-thread-pools id)
        (log/debug (trs "Creating new query thread pool for Database {0}" id))
        (let [new-pool (new-thread-pool id)]
          (swap! db-thread-pools assoc id new-pool)
          new-pool))))))

(defn destroy-thread-pool!
  "Destroy the QP thread pool for a Database (done automatically when DB is deleted.)"
  [database-or-id]
  (let [id (u/get-id database-or-id)]
    (let [[{^ExecutorService thread-pool id}] (locking db-thread-pool-lock
                                                (swap-vals! db-thread-pools dissoc id))]
      (when thread-pool
        (log/debug (trs "Destroying query thread pool for Database {0}" id))
        (.shutdownNow thread-pool)))))

(def ^:private ^:dynamic *already-in-thread-pool?* false)

(defn- runnable ^Runnable [qp query respond raise canceled-chan]
  ;; stash & restore bound dynamic vars. This is how Clojure does it for futures and the like in `binding-conveyor-fn`
  ;; (see source for `future` or `future-call`) which is unfortunately private
  (let [frame (Var/cloneThreadBindingFrame)]
    (^:once fn* []
     (Var/resetThreadBindingFrame frame)
     (binding [*already-in-thread-pool?* true]
       (try
         (qp query respond raise canceled-chan)
         (catch Throwable e
           (raise e)))))))

(defn- run-in-thread-pool [qp {database-id :database, :as query} respond raise canceled-chan]
  (try
    (let [pool  (db-thread-pool database-id)
          futur (.submit pool (runnable qp query respond raise canceled-chan))]
      (a/go
        (when (a/<! canceled-chan)
          (log/debug (trs "Request canceled, canceling pending query"))
          (future-cancel futur))))
    (catch Throwable e
      (raise e)))
  nil)

(defn wait-for-turn
  "Middleware that throttles the number of concurrent queries for each connected database, parking the thread until it
  is allowed to run."
  [qp]
  (fn [{database-id :database, :as query} respond raise canceled-chan]
    (if *already-in-thread-pool?*
      (qp query respond raise canceled-chan)
      (run-in-thread-pool qp query respond raise canceled-chan))))
