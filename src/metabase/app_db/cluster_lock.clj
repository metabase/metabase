(ns metabase.app-db.cluster-lock
  "Utility for taking a cluster wide lock using the application database"
  (:require
   [clojure.string :as str]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.query :as mdb.query]
   [metabase.app-db.query-cancelation :as app-db.query-cancelation]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection PreparedStatement SQLIntegrityConstraintViolationException)))

(set! *warn-on-reflection* true)

(def ^:private cluster-lock-timeout-seconds 1)

(defn- retryable?
  [^Throwable e]
  ;; We can retry getting the cluster lock if either we tried to concurrently insert the pk
  ;; for the lock resulting in a SQLIntegrityConstraintViolationException or if the query
  ;; was cancelled via timeout waiting to get the SELECT FOR UPDATE lock
  (or (instance? SQLIntegrityConstraintViolationException e)
      (instance? SQLIntegrityConstraintViolationException (ex-cause e))
      ;; Postgres does just uses PSQLException, so we need to fall back to checking the message.
      (some-> (ex-message e) (str/includes? "duplicate key value violates unique constraint \"metabase_cluster_lock_pkey\""))
      (app-db.query-cancelation/query-canceled-exception? (mdb.connection/db-type) e)))

(def ^:private default-retry-config
  {:max-retries 4
   :delay-ms 1000 ;; Constant delay between retries.
   :retry-if (fn [_ e] (retryable? e))})

(defn- prepare-statement
  "Create a prepared statement to query cache"
  ^PreparedStatement [^Connection conn lock-name-str timeout]
  (let [stmt (.prepareStatement conn ^String (first (mdb.query/compile {:select [:lock.lock_name]
                                                                        :from [[:metabase_cluster_lock :lock]]
                                                                        :where [:= :lock.lock_name [:raw "?"]]
                                                                        :for :update})))]
    (try
      (doto stmt
        (.setQueryTimeout timeout)
        (.setString 1 lock-name-str)
        (.setMaxRows 1))
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defn- do-with-cluster-lock*
  [lock-name-str timeout-seconds thunk]
  (t2/with-transaction [conn]
    (with-open [stmt (prepare-statement conn lock-name-str timeout-seconds)
                result-set (.executeQuery stmt)]
      (when-not (.next result-set)
        ;; this record will not be visible until the tx commits, so there's no need to lock it
        ;; we instead rely on concurrent threads having constraint violation trying to insert their own record
        (t2/query-one {:insert-into [:metabase_cluster_lock]
                       :columns [:lock_name]
                       :values [[lock-name-str]]})))
    (log/debug "Obtained cluster lock")
    (thunk)))

(mu/defn do-with-cluster-lock
  "Impl for `with-cluster-lock`.

  Call `thunk` after first synchronizing with the metabase cluster by taking a lock in the appdb."
  [opts :- [:or :keyword
            [:map
             [:lock-name                        :keyword]
             [:timeout-seconds {:optional true} :int]
             [:retry-config    {:optional true} [:ref ::retry/retry-overrides]]]]
   thunk :- ifn?]
  (cond
    ;; h2 does not respect the query timeout when taking the lock
    ;; we do not support multiple instances for h2 however, so an in-process lock is sufficient.
    (= (mdb.connection/db-type) :h2) (locking do-with-cluster-lock (thunk))
    (keyword? opts) (do-with-cluster-lock {:lock-name opts} thunk)
    :else (let [{:keys [timeout-seconds retry-config lock-name] :or {timeout-seconds cluster-lock-timeout-seconds}} opts
                lock-name-str (str (namespace lock-name) "/" (name lock-name))
                config (merge default-retry-config retry-config)]
            (try
              (retry/with-retry config
                (do-with-cluster-lock* lock-name-str timeout-seconds thunk))
              (catch Throwable e
                (if (retryable? e)
                  (throw (ex-info "Failed to run statement with cluster lock"
                                  {:retries (:max-retries config)}
                                  e))
                  (throw e)))))))

(defmacro with-cluster-lock
  "Run `body` in a transaction that tries to take a lock from the metabase_cluster_lock table of
  the specified name to coordinate concurrency with other metabase instances sharing the appdb."
  ([lock-options & body]
   `(do-with-cluster-lock ~lock-options (fn [] ~@body))))

(def card-statistics-lock
  "A shared keyword that any method doing a batch update of card statistics can use for the cluster lock"
  ::statistics-lock)
