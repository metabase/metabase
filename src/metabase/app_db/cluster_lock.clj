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
   [metabase.app-db.transient-error :as transient-error]
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
  "Errors that mean we failed to *acquire* the lock and should retry acquisition."
  [^Throwable e]
  ;; We can retry getting the cluster lock if either we tried to concurrently insert the pk
  ;; for the lock resulting in a SQLIntegrityConstraintViolationException or if the query
  ;; was cancelled via timeout waiting to get the SELECT FOR UPDATE lock
  (or (instance? SQLIntegrityConstraintViolationException e)
      (instance? SQLIntegrityConstraintViolationException (ex-cause e))
      ;; Postgres does just uses PSQLException, so we need to fall back to checking the message.
      (some-> (ex-message e) (str/includes? "duplicate key value violates unique constraint \"metabase_cluster_lock_pkey\""))
      (app-db.query-cancelation/query-canceled-exception? (mdb.connection/db-type) e)))

(defn- retry-if-error?
  "Should we retry after exception `e`? Always retry lock-acquisition failures. When `retry-transient?`
  is set, *also* retry transient db errors (deadlocks, lock timeouts, serialization failures) — on
  multi-master appdbs like MariaDB Galera row locks aren't replicated across nodes, so the lock can't
  serialize writers and the conflicting commit surfaces as a deadlock. Only callers whose locked body is
  safe to re-run from scratch (idempotent, no side effects outside the appdb transaction) should opt in."
  [retry-transient? ^Throwable e]
  (or (retryable? e)
      (and retry-transient?
           (transient-error/transient-error? (mdb.connection/db-type) e))))

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
      ;; this record will not be visible until the tx commits, so there's no need to lock it; concurrent
      ;; inserters get a constraint violation and retry. Raw JDBC because the insert must run on `conn`
      ;; (in detached mode ambient resolution would hand it a different connection) and needs the same
      ;; query timeout as the SELECT — concurrent first-time inserters block on the winner's uncommitted
      ;; unique-index entry
      (let [[sql] (mdb.query/compile {:insert-into [:metabase_cluster_lock]
                                      :columns     [:lock_name]
                                      :values      [[[:raw "?"]]]})]
        (with-open [insert-stmt (.prepareStatement conn ^String sql)]
          (doto insert-stmt
            (.setQueryTimeout timeout)
            (.setString 1 lock-name-str))
          (.executeUpdate insert-stmt)))))
  (log/debugf "Obtained cluster lock: %s (%s)" lock-name-str mode))

(def ^:private ^:dynamic *cluster-locks-held*
  "Map of lock-name-str -> {:mode, :detached?} for cluster locks held within the current dynamic scope.
  Dynamic bindings convey, so threads spawned inside a locked body inherit the entries and will skip
  re-acquisition of locks the parent holds -- do not let such threads outlive the body. Used to make
  re-acquisition of a held lock a no-op instead of a self-deadlock: a detached hold lives on a dedicated
  connection that a second acquisition (in either mode) would block against."
  {})

(defn- held-mode-covers?
  "Whether an already-held lock in `held-mode` satisfies a request for `requested-mode`."
  [held-mode requested-mode]
  (or (= held-mode :exclusive)
      (= held-mode requested-mode)))

(defn- validate-held-locks!
  "Eagerly reject mode upgrades that would self-deadlock, before any row is locked: requesting
  `:exclusive` on a lock this scope holds in `:share` mode blocks forever against our own hold whenever
  the hold or the request is detached (they are on different connections). A transactional `:share` hold
  re-requested transactionally as `:exclusive` is left alone -- the same transaction may legitimately
  upgrade its own row lock."
  [locks detached-request?]
  (doseq [{:keys [lock-name-str mode]} locks]
    (when-let [{held-mode :mode, held-detached? :detached?} (*cluster-locks-held* lock-name-str)]
      (when (and (not (held-mode-covers? held-mode mode))
                 (or held-detached? detached-request?))
        (throw (ex-info "Cannot upgrade a held cluster lock from :share to :exclusive"
                        {:lock-name lock-name-str :held held-mode :requested mode}))))))

(defn- needed-locks
  "The subset of `locks` not already covered by a hold in the current dynamic scope."
  [locks]
  (filterv (fn [{:keys [lock-name-str mode]}]
             (let [{held-mode :mode} (*cluster-locks-held* lock-name-str)]
               (not (and held-mode (held-mode-covers? held-mode mode)))))
           locks))

(defn- holding-locks
  "The held-locks registry with `locks` recorded as held."
  [locks detached?]
  (into *cluster-locks-held*
        (map (fn [{:keys [lock-name-str mode]}]
               [lock-name-str {:mode mode :detached? detached?}]))
        locks))

(defn- do-with-cluster-locks*
  "Acquire all `locks` (each a `{:lock-name-str, :mode}` map) inside a single transaction, then run
  `thunk`. Locks already held in the current dynamic scope are skipped -- re-acquiring a detached hold
  here would block against our own dedicated connection. Sets `acquired?` once every lock is held."
  [locks timeout-seconds thunk acquired?]
  (validate-held-locks! locks false)
  (let [needed (needed-locks locks)]
    (t2/with-transaction [conn]
      (doseq [{:keys [lock-name-str mode]} needed]
        (acquire-lock-row! conn lock-name-str timeout-seconds mode))
      (vreset! acquired? true)
      (binding [*cluster-locks-held* (holding-locks needed false)]
        (thunk)))))

(defn- do-with-detached-cluster-locks*
  "Like [[do-with-cluster-locks*]], but holds the lock rows on a dedicated unshared connection
  (see [[metabase.app-db.connection/with-unshared-connection]]) while `thunk` runs on ordinary pooled
  connections: `thunk`'s toucan work commits incrementally in its own short transactions instead of
  riding one long transaction on the lock's connection. The locks are released when `thunk` completes
  (commit) or throws (the pool rolls the dedicated connection back on check-in) -- but `thunk`'s own
  already-committed work is NOT rolled back on a throw. Sets `acquired?` once every lock is held, which
  [[do-with-cluster-lock]] uses to confine retries and the acquisition-failure wrapper to the
  acquisition phase: re-running an incrementally-committed body would double-apply its work."
  [locks timeout-seconds thunk acquired?]
  (validate-held-locks! locks true)
  (let [needed (needed-locks locks)]
    (if (empty? needed)
      (thunk)
      (mdb.connection/with-unshared-connection [conn]
        (.setAutoCommit ^Connection conn false)
        (doseq [{:keys [lock-name-str mode]} needed]
          (acquire-lock-row! conn lock-name-str timeout-seconds mode))
        (vreset! acquired? true)
        (let [result (binding [*cluster-locks-held* (holding-locks needed true)]
                       (thunk))]
          ;; releases the row locks and persists any lock rows we inserted
          (.commit ^Connection conn)
          result)))))

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
          ;; a ReentrantReadWriteLock read->write upgrade blocks forever; fail fast like the row-lock impls
          (when (and (= mode :exclusive) (pos? (.getReadHoldCount rw)))
            (throw (ex-info "Cannot upgrade a held cluster lock from :share to :exclusive"
                            {:lock-name lock-name-str :held :share :requested mode})))
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
    (let [{:keys [lock locks timeout-seconds retry-config retry-transient? detached?]} opts]
      (when (and lock locks)
        (throw (ex-info "Cluster-lock opts must specify exactly one of :lock or :locks"
                        {:opts opts})))
      (when-not (or lock locks)
        (throw (ex-info "Cluster-lock opts must specify :lock or :locks" {:opts opts})))
      (when (and detached? retry-transient?)
        ;; :retry-transient? re-runs the body assuming a rollback undid its work; detached bodies commit
        ;; incrementally, so a re-run would double-apply everything before the failure
        (throw (ex-info "Cluster-lock opts :detached? and :retry-transient? are mutually exclusive"
                        {:opts opts})))
      (cond-> {:locks            (if lock
                                   [(normalize-lock-spec (if (map? lock)
                                                           lock
                                                           {:lock lock :mode (or (:mode opts) :exclusive)}))]
                                   (mapv normalize-lock-spec locks))
               :retry-transient? (boolean retry-transient?)
               :detached?        (boolean detached?)}
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
    `:mode`, `:timeout-seconds`, `:retry-config`, `:retry-transient?`, and `:detached?`:

      {:lock ::foo}                                     ; exclusive on ::foo
      {:lock ::foo :mode :share}                        ; shared on ::foo
      {:lock ::foo :timeout-seconds 5}                  ; with timeout override
      {:lock ::foo :retry-transient? true}              ; also retry deadlocks (see below)
      {:lock ::foo :detached? true}                     ; hold on a dedicated connection (see below)
      {:locks [::foo ::bar]}                            ; two exclusive locks
      {:locks [{:lock ::root :mode :share}              ; intent-lock pattern:
               {:lock ::leaf :mode :exclusive}]         ;  shared root + exclusive
       :timeout-seconds 5}                              ;  leaf, with timeout

  In the `:locks` form, each element is either a bare keyword (exclusive) or a
  map `{:lock, :mode}`. Per-element timeout/retry config is not supported —
  those live on the top-level opts map. All locks are acquired in order inside
  a single transaction.

  `:retry-transient?` (default false) additionally retries transient db errors —
  deadlocks, lock timeouts, serialization failures — that surface from inside the
  locked body. On multi-master appdbs (e.g. MariaDB Galera) row locks aren't
  replicated across nodes, so the lock can't serialize writers and the conflicting
  commit comes back as a deadlock. Only opt in when the body is safe to re-run from
  scratch — idempotent, with no side effects outside the appdb transaction (a
  rolled-back deadlock undoes only the db writes, not external calls).

  `:detached?` (default false) holds the lock rows on a dedicated connection instead
  of the caller's transaction: the body's toucan work then runs on ordinary pooled
  connections in its own short transactions, committing incrementally, rather than
  riding one long transaction that holds the lock. Use for long-running locked work
  (e.g. the audit DB install/load/sync at boot) whose body is idempotent/self-healing —
  a failure mid-body does NOT roll back its already-committed work. Re-acquiring a
  lock already held in the current dynamic scope is a no-op (in both detached and
  transactional form), but requesting `:exclusive` on a lock held in `:share` mode
  throws rather than self-deadlock. Mutually exclusive with `:retry-transient?`.

  Detached-hold duration is bounded by the connection pool's limits: c3p0's
  `unreturnedConnectionTimeout` (when configured) destroys connections checked out
  longer, silently releasing the locks mid-body; and with the appdb checkout timeout
  set to 0 (wait forever), a body blocked on pool checkout holds the locks
  indefinitely. Keep detached bodies well under those horizons."
  [opts :- [:or
            :keyword
            [:map
             [:lock             {:optional true} :keyword]
             [:locks            {:optional true} [:sequential
                                                  [:or :keyword
                                                   [:map
                                                    [:lock :keyword]
                                                    [:mode {:optional true} [:enum :exclusive :share]]]]]]
             [:mode             {:optional true} [:enum :exclusive :share]]
             [:timeout-seconds  {:optional true} :int]
             [:retry-config     {:optional true} [:ref ::retry/retry-overrides]]
             [:retry-transient? {:optional true} :boolean]
             [:detached?        {:optional true} :boolean]]]
   thunk :- ifn?]
  (let [{:keys [locks timeout-seconds retry-config retry-transient? detached?]
         :or   {timeout-seconds cluster-lock-timeout-seconds}} (parse-opts opts)]
    (cond
      ;; h2 does not respect the query timeout when taking the lock and is not cross-process,
      ;; so we fall back to an in-process ReentrantReadWriteLock per lock name. The h2 locks never
      ;; hold a transaction open, so :detached? is already the behavior and needs no special casing.
      (= (mdb.connection/db-type) :h2)
      (do-with-h2-cluster-locks* locks thunk)

      :else
      (let [acquired? (volatile! false)
            config    (assoc (merge default-retry-config retry-config)
                             ;; a detached body commits incrementally, so a retryable-looking error it
                             ;; throws must not re-run it (or be mistaken for acquisition failure below):
                             ;; past acquisition, detached errors propagate raw. A transactional body is
                             ;; safe to re-run — its rollback restored the slate — and :retry-transient?
                             ;; depends on that.
                             :retry-if (fn [_ e]
                                         (and (or (not detached?) (not @acquired?))
                                              (retry-if-error? retry-transient? e))))
            impl      (if detached? do-with-detached-cluster-locks* do-with-cluster-locks*)]
        (try
          (retry/with-retry config
            (vreset! acquired? false)
            (impl locks timeout-seconds thunk acquired?))
          (catch Throwable e
            (if (and (retryable? e)
                     (or (not detached?) (not @acquired?)))
              (throw (ex-info (str "Failed to obtain cluster lock: "
                                   (str/join ", " (map :lock-name-str locks)))
                              {:lock-names (mapv :lock-name-str locks)
                               :retries (:max-retries config)}
                              e))
              (throw e))))))))

(defmacro with-cluster-lock
  "Run `body` while holding one or more named locks from the metabase_cluster_lock table, to
  coordinate concurrency with other metabase instances sharing the appdb. By default `body` runs
  inside the transaction that holds the lock rows, so a throw rolls its appdb work back with the
  lock; with `:detached? true` the locks live on a dedicated connection and `body`'s work commits
  incrementally (no rollback on throw); on an h2 appdb the lock is an in-process read-write lock
  and no transaction is involved.

  `lock-options` may be a lock-name keyword, or an options map
  `{:lock, :locks, :mode, :timeout-seconds, :retry-config, :retry-transient?}` —
  see [[do-with-cluster-lock]] for the full description of each."
  ([lock-options & body]
   `(do-with-cluster-lock ~lock-options (fn [] ~@body))))

(def card-statistics-lock
  "A shared keyword that any method doing a batch update of card statistics can use for the cluster lock"
  ::statistics-lock)
