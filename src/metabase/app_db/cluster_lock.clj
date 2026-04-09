(ns metabase.app-db.cluster-lock
  "Utility for taking a cluster wide lock using the application database.

  Supports two modes:
  - `:exclusive` (default) — row-level `FOR UPDATE`. Two exclusive holders of the
    same lock-name serialize.
  - `:share` — row-level `FOR SHARE`. Multiple shared holders of the same lock-name
    can proceed in parallel, but any shared holder blocks an exclusive acquirer
    and vice versa.

  This lets callers build intent-lock patterns (shared on a root + exclusive on
  a leaf) — see [[metabase.permissions.models.data-permissions/with-db-scoped-permissions-lock]]
  for an example.

  Lock ordering rule: if you acquire multiple cluster locks, always acquire them
  in a consistent order across call sites to avoid deadlock. The multi-lock arity
  of [[do-with-cluster-lock]] acquires them in the order given; prefer that over
  manually nesting `with-cluster-lock` forms."
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
   (java.sql Connection PreparedStatement SQLIntegrityConstraintViolationException)
   (java.util.concurrent ConcurrentHashMap)
   (java.util.concurrent.locks Lock ReentrantReadWriteLock)
   (java.util.function Function)))

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

;; MySQL 8.0+ supports `SELECT ... FOR SHARE`, but MariaDB (all versions as of
;; writing) only understands the older `LOCK IN SHARE MODE` syntax.
;; `LOCK IN SHARE MODE` works on all supported MySQL-family versions including
;; MySQL 8, so we use it uniformly for `:mysql`.
(defn- lock-clause
  "Returns the trailing locking clause to append to the base SELECT."
  [mode]
  (case mode
    :exclusive " FOR UPDATE"
    :share     (if (= (mdb.connection/db-type) :mysql)
                 " LOCK IN SHARE MODE"
                 " FOR SHARE")))

(def ^:private base-lock-sql
  (delay
    (first (mdb.query/compile {:select [:lock.lock_name]
                               :from [[:metabase_cluster_lock :lock]]
                               :where [:= :lock.lock_name [:raw "?"]]}))))

(defn- lock-sql ^String [mode]
  (str @base-lock-sql (lock-clause mode)))

(defn- prepare-statement
  "Create a prepared statement to acquire a lock row in the given mode."
  ^PreparedStatement [^Connection conn lock-name-str timeout mode]
  (let [stmt (.prepareStatement conn (lock-sql mode))]
    (try
      (doto stmt
        (.setQueryTimeout timeout)
        (.setString 1 lock-name-str)
        (.setMaxRows 1))
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defn- acquire-lock-row!
  [^Connection conn lock-name-str timeout mode]
  (with-open [stmt (prepare-statement conn lock-name-str timeout mode)
              result-set (.executeQuery stmt)]
    (when-not (.next result-set)
      ;; this record will not be visible until the tx commits, so there's no need to lock it
      ;; we instead rely on concurrent threads having constraint violation trying to insert their own record
      (t2/query-one {:insert-into [:metabase_cluster_lock]
                     :columns [:lock_name]
                     :values [[lock-name-str]]})))
  (log/debugf "Obtained cluster lock: %s (%s)" lock-name-str mode))

(defn- do-with-cluster-locks*
  "Acquire all `locks` (each a `{:lock-name-str, :mode}` map) inside a single
  transaction, then run `thunk`."
  [locks timeout-seconds thunk]
  (t2/with-transaction [conn]
    (doseq [{:keys [lock-name-str mode]} locks]
      (acquire-lock-row! conn lock-name-str timeout-seconds mode))
    (thunk)))

;; ---------- h2 in-process rw locks ----------
;;
;; h2 does not respect query timeout when taking SELECT ... FOR UPDATE locks, and
;; Metabase does not support multi-instance h2 deployments. So for h2 we take an
;; in-process `ReentrantReadWriteLock` keyed by lock-name. Shared mode → read lock,
;; exclusive mode → write lock. Still supports reentrancy within a single thread.

(defonce ^:private ^ConcurrentHashMap h2-locks (ConcurrentHashMap.))

(defn- h2-rw-lock ^ReentrantReadWriteLock [lock-name-str]
  (.computeIfAbsent h2-locks lock-name-str
                    (reify Function (apply [_ _] (ReentrantReadWriteLock.)))))

(defn- do-with-h2-cluster-locks*
  [locks thunk]
  (let [^java.util.List held (java.util.ArrayList.)]
    (try
      (doseq [{:keys [lock-name-str mode]} locks]
        (let [rw (h2-rw-lock lock-name-str)
              ^Lock lock (if (= mode :share) (.readLock rw) (.writeLock rw))]
          (.lock lock)
          (.add held lock)
          (log/debugf "Obtained h2 cluster lock: %s (%s)" lock-name-str mode)))
      (thunk)
      (finally
        (doseq [^Lock lock (reverse held)]
          (.unlock lock))))))

;; ---------- public API ----------

(defn- keyword->lock-name-str [kw]
  (str (namespace kw) "/" (name kw)))

(defn- normalize-lock-spec
  "Turn an element of `:locks` into a `{:lock-name-str, :mode}` map. Each element
  may be a bare keyword (→ exclusive) or a `{:lock, :mode}` map."
  [spec]
  (cond
    (keyword? spec)
    {:lock-name-str (keyword->lock-name-str spec) :mode :exclusive}

    (map? spec)
    (let [{:keys [lock mode] :or {mode :exclusive}} spec]
      (when-not (keyword? lock)
        (throw (ex-info "Cluster-lock spec map must have a :lock keyword" {:spec spec})))
      {:lock-name-str (keyword->lock-name-str lock) :mode mode})

    :else
    (throw (ex-info "Invalid cluster-lock spec" {:spec spec}))))

(defn- parse-opts
  "Turn user-supplied `opts` into `{:locks, :timeout-seconds, :retry-config}`."
  [opts]
  (cond
    (keyword? opts)
    {:locks [(normalize-lock-spec opts)]}

    (map? opts)
    (let [{:keys [lock locks timeout-seconds retry-config]} opts]
      (when (and lock locks)
        (throw (ex-info "Cluster-lock opts must specify exactly one of :lock or :locks"
                        {:opts opts})))
      (when-not (or lock locks)
        (throw (ex-info "Cluster-lock opts must specify :lock or :locks" {:opts opts})))
      (cond-> {:locks (if lock
                        [(normalize-lock-spec (if (map? lock)
                                                lock
                                                {:lock lock :mode (or (:mode opts) :exclusive)}))]
                        (mapv normalize-lock-spec locks))}
        timeout-seconds (assoc :timeout-seconds timeout-seconds)
        retry-config    (assoc :retry-config retry-config)))

    :else
    (throw (ex-info "Invalid cluster-lock opts" {:opts opts}))))

(mu/defn do-with-cluster-lock
  "Impl for `with-cluster-lock`.

  Call `thunk` after first synchronizing with the metabase cluster by taking one
  or more locks in the appdb. `opts` can be:

  - a keyword `lock-name` — shorthand for exclusive lock on that name with default
    timeout and retry config.
  - a map with `:lock` (a keyword) or `:locks` (a seq of specs), plus optional
    `:mode`, `:timeout-seconds`, and `:retry-config`:

      {:lock ::foo}                                     ; exclusive on ::foo
      {:lock ::foo :mode :share}                        ; shared on ::foo
      {:lock ::foo :timeout-seconds 5}                  ; with timeout override
      {:locks [::foo ::bar]}                            ; two exclusive locks
      {:locks [{:lock ::root :mode :share}              ; intent-lock pattern:
               {:lock ::leaf :mode :exclusive}]         ;  shared root + exclusive
       :timeout-seconds 5}                              ;  leaf, with timeout

  In the `:locks` form, each element is either a bare keyword (exclusive) or a
  map `{:lock, :mode}`. Per-element timeout/retry config is not supported —
  those live on the top-level opts map. All locks are acquired in order inside
  a single transaction."
  [opts :- [:or
            :keyword
            [:map
             [:lock            {:optional true} :keyword]
             [:locks           {:optional true} [:sequential
                                                 [:or :keyword
                                                  [:map
                                                   [:lock :keyword]
                                                   [:mode {:optional true} [:enum :exclusive :share]]]]]]
             [:mode            {:optional true} [:enum :exclusive :share]]
             [:timeout-seconds {:optional true} :int]
             [:retry-config    {:optional true} [:ref ::retry/retry-overrides]]]]
   thunk :- ifn?]
  (let [{:keys [locks timeout-seconds retry-config]
         :or   {timeout-seconds cluster-lock-timeout-seconds}} (parse-opts opts)]
    (cond
      ;; h2 does not respect the query timeout when taking the lock and is not cross-process,
      ;; so we fall back to an in-process ReentrantReadWriteLock per lock name.
      (= (mdb.connection/db-type) :h2)
      (do-with-h2-cluster-locks* locks thunk)

      :else
      (let [config (merge default-retry-config retry-config)]
        (try
          (retry/with-retry config
            (do-with-cluster-locks* locks timeout-seconds thunk))
          (catch Throwable e
            (if (retryable? e)
              (throw (ex-info (str "Failed to obtain cluster lock: "
                                   (str/join ", " (map :lock-name-str locks)))
                              {:lock-names (mapv :lock-name-str locks)
                               :retries (:max-retries config)}
                              e))
              (throw e))))))))

(defmacro with-cluster-lock
  "Run `body` in a transaction that tries to take a lock from the metabase_cluster_lock table of
  the specified name to coordinate concurrency with other metabase instances sharing the appdb.

  `lock-options` may be a lock-name keyword, an options map
  `{:lock-name, :mode, :timeout-seconds, :retry-config}`, or a vector of such specs
  (all acquired in order inside one transaction)."
  ([lock-options & body]
   `(do-with-cluster-lock ~lock-options (fn [] ~@body))))

(def card-statistics-lock
  "A shared keyword that any method doing a batch update of card statistics can use for the cluster lock"
  ::statistics-lock)
