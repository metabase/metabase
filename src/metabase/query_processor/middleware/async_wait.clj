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
            [metabase.query-processor.context :as context]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-trs trs]]
            [schema.core :as s])
  (:import [java.util.concurrent Executors ExecutorService]
           org.apache.commons.lang3.concurrent.BasicThreadFactory$Builder))

(defsetting max-simultaneous-queries-per-db
  (deferred-trs "Maximum number of simultaneous queries to allow per connected Database.")
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
      ;; Running queries should be lower priority than other stuff e.g. API responses
      (.priority Thread/MIN_PRIORITY)))))

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

(def ^:private ^:dynamic *already-in-thread-pool?*
  "True if the current thread is a thread pool thread from the a DB thread pool (i.e., if we're already running
  asynchronously after waiting if needed.)"
  false)

(def ^:dynamic *disable-async-wait*
  "Whether to disable async waiting entirely. Bind this to `true` for cases where we would not like to enforce async
  waiting, such as for functions like `qp/query->native` that don't actually run queries.

  DO NOT BIND THIS TO TRUE IN SITUATIONS WHERE WE ACTUALLY RUN QUERIES: some functionality relies on the fact that
  things are ran in a separate thread to function correctly, such as the cancellation code that listens for
  InterruptedExceptions."
  false)

(defn- runnable ^Runnable [qp query rff context]
  (bound-fn []
    (binding [*already-in-thread-pool?* true]
      (try
        (qp query rff context)
        (catch Throwable e
          (context/raisef e context))))))

(defn- run-in-thread-pool [qp {database-id :database, :as query} rff context]
  {:pre [(integer? database-id)]}
  (try
    (let [pool          (db-thread-pool database-id)
          futur         (.submit pool (runnable qp query rff context))
          canceled-chan (context/canceled-chan context)]
      (a/go
        (when (a/<! canceled-chan)
          (log/debug (trs "Request canceled, canceling pending query"))
          (future-cancel futur))))
    (catch Throwable e
      (context/raisef e context)))
  nil)

(defn wait-for-turn
  "Middleware that throttles the number of concurrent queries for each connected database, parking the thread until it
  is allowed to run."
  [qp]
  (fn [query rff context]
    {:pre [(map? query)]}
    (if (or *already-in-thread-pool?* *disable-async-wait*)
      (qp query rff context)
      (run-in-thread-pool qp query rff context))))
