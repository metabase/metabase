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
   [metabase.util.connection :as u.connection]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection PreparedStatement SQLException SQLIntegrityConstraintViolationException)
   (java.util.concurrent ConcurrentHashMap TimeUnit)
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
      ;; how the two bounded waits that the driver cannot cancel for us mark themselves: MySQL's
      ;; InnoDB lock-wait timeout, and h2's in-process `tryLock`
      (true? (::acquisition-timeout (ex-data e)))
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
      (u.connection/set-query-timeout! stmt timeout)
      (doto stmt
        (.setString 1 lock-name-str)
        (.setMaxRows 1))
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(def ^:private lock-wait-timeout-error-code
  "MySQL's ER_LOCK_WAIT_TIMEOUT."
  1205)

(defn- session-lock-wait-timeout
  [^Connection conn]
  (with-open [stmt (.createStatement conn)
              rset (.executeQuery stmt "SELECT @@session.innodb_lock_wait_timeout")]
    (when (.next rset)
      (.getLong rset 1))))

(defn- set-session-lock-wait-timeout!
  [^Connection conn seconds]
  (with-open [stmt (.createStatement conn)]
    (.execute stmt (str "SET SESSION innodb_lock_wait_timeout = " (long seconds)))))

(defn- do-with-lock-wait-timeout
  "Run `f` with InnoDB's session lock-wait timeout set to `timeout-seconds`, restoring the old value afterwards.
  Used where the driver cannot carry the timeout itself (see [[u.connection/set-query-timeout!]]): acquisition blocks
  on the lock row, so the lock-wait timeout is what bounds it.
  A timeout here means we lost the race for the lock, so it surfaces as an acquisition failure the retry loop knows."
  [^Connection conn timeout-seconds f]
  ;; the connection is usually pooled, so the old value has to go back before it is handed to anyone else
  (let [previous (session-lock-wait-timeout conn)]
    (set-session-lock-wait-timeout! conn timeout-seconds)
    (try
      (f)
      (catch SQLException e
        (throw (if (= (.getErrorCode e) lock-wait-timeout-error-code)
                 (ex-info "Timed out waiting for the cluster lock row" {::acquisition-timeout true} e)
                 e)))
      (finally
        (when previous
          (set-session-lock-wait-timeout! conn previous))))))

(defn- acquire-lock-row!*
  [^Connection conn lock-name-str timeout mode]
  (with-open [stmt (prepare-statement conn lock-name-str timeout mode)
              result-set (.executeQuery stmt)]
    (when-not (.next result-set)
      ;; this record will not be visible until the tx commits, so there's no need to lock it; concurrent
      ;; inserters get a constraint violation and retry. Raw JDBC because the insert must run on `conn`
      ;; (under a detached lock ambient resolution would hand it a different connection) and needs the
      ;; same query timeout as the SELECT — concurrent first-time inserters block on the winner's
      ;; uncommitted unique-index entry
      (let [[sql] (mdb.query/compile {:insert-into [:metabase_cluster_lock]
                                      :columns     [:lock_name]
                                      :values      [[[:raw "?"]]]})]
        (with-open [insert-stmt (.prepareStatement conn ^String sql)]
          (u.connection/set-query-timeout! insert-stmt timeout)
          (.setString insert-stmt 1 lock-name-str)
          (.executeUpdate insert-stmt)))))
  (log/debugf "Obtained cluster lock: %s (%s)" lock-name-str mode))

(defn- acquire-lock-row!
  [^Connection conn lock-name-str timeout mode]
  (if (u.connection/server-rejects-query-timeout? conn)
    (do-with-lock-wait-timeout conn timeout #(acquire-lock-row!* conn lock-name-str timeout mode))
    (acquire-lock-row!* conn lock-name-str timeout mode)))

(def ^:private ^:dynamic *detached-locks-held*
  "Lock-name strings currently held by [[do-with-detached-cluster-lock]] in this dynamic scope. A detached
  hold lives on a dedicated connection, so re-acquiring the same name from this scope — detached or
  transactional — would block against our own row lock; acquisitions fail fast instead."
  #{})

(defn- check-not-held-detached!
  "Throw if any of `lock-name-strs` is already held detached in this scope.

  Both lock impls need this, for different reasons: a detached row lock lives on a dedicated connection,
  so re-acquiring it here would block against our own row until the timeout; the h2 lock is *reentrant*,
  so re-acquiring it would silently succeed and let a caller violate the no-reentry rule on h2 while
  failing on every other appdb."
  [lock-name-strs]
  (doseq [lock-name-str lock-name-strs]
    (when (*detached-locks-held* lock-name-str)
      (throw (ex-info "Cluster lock is already held detached in this scope"
                      {:lock-name lock-name-str})))))

(defn- do-with-cluster-locks*
  "Acquire all `locks` (each a `{:lock-name-str, :mode}` map) inside a single
  transaction, then run `thunk`.

  `entered` is set once every lock is held, so the caller can tell an acquisition failure apart from a
  failure of `thunk` itself. It is reset on entry because each retry re-runs this fn."
  [locks timeout-seconds entered thunk]
  (vreset! entered false)
  (check-not-held-detached! (map :lock-name-str locks))
  (t2/with-transaction [conn]
    (doseq [{:keys [lock-name-str mode]} locks]
      (acquire-lock-row! conn lock-name-str timeout-seconds mode))
    (vreset! entered true)
    (thunk)))

;; ---------- h2 in-process rw locks ----------
;;
;; h2 does not respect query timeout when taking SELECT ... FOR UPDATE locks, and
;; Metabase does not support multi-instance h2 deployments. So for h2 we take an
;; in-process `ReentrantReadWriteLock` keyed by lock-name. Shared mode → read lock,
;; exclusive mode → write lock. Still supports reentrancy within a single thread.
;;
;; Acquisition is *bounded* (tryLock with the caller's timeout) and goes through the same retry and
;; error-wrapping path as the row-lock branch. An untimed `.lock()` would block indefinitely, which made
;; the documented skip-on-contention behaviour false on h2 and left the row-lock path unreproducible in
;; h2 tests.

(defonce ^:private ^ConcurrentHashMap h2-locks (ConcurrentHashMap.))

(defn- h2-rw-lock ^ReentrantReadWriteLock [lock-name-str]
  (.computeIfAbsent h2-locks lock-name-str
                    (reify Function (apply [_ _] (ReentrantReadWriteLock.)))))

(defn- release-h2-locks!
  "Release the locks returned by [[acquire-h2-locks!]]; they already come back in release order."
  [held]
  (doseq [^Lock lock held]
    (.unlock lock)))

(defn- acquire-h2-locks!
  "Take `locks` in order, each bounded by `timeout-seconds`. Returns the held locks in reverse
  acquisition order, for [[release-h2-locks!]]. Releases whatever it already holds before throwing, so a
  partial acquisition never leaks a lock.

  Acquisition and release are split (rather than bracketing a thunk) because the detached path has to run
  its body *outside* the retry that wraps acquisition — see [[do-with-detached-cluster-lock]]."
  [locks timeout-seconds]
  (let [held (volatile! ())]
    (try
      (doseq [{:keys [lock-name-str mode]} locks]
        (let [rw (h2-rw-lock lock-name-str)
              ^Lock lock (if (= mode :share) (.readLock rw) (.writeLock rw))]
          (if (pos? timeout-seconds)
            (when-not (.tryLock lock (long timeout-seconds) TimeUnit/SECONDS)
              ;; Marked so `retryable?` treats this like the row-lock wait timeout: retried by the
              ;; shared retry config, then surfaced as the usual :lock-names ex-info.
              (throw (ex-info (str "Timed out acquiring h2 cluster lock: " lock-name-str)
                              {::acquisition-timeout true :lock-name lock-name-str})))
            ;; `.setQueryTimeout 0` means *no* limit, so the row-lock branch waits indefinitely for 0 —
            ;; match that rather than letting 0 mean "don't wait at all" here
            (.lock lock))
          (vswap! held conj lock)
          (log/debugf "Obtained h2 cluster lock: %s (%s)" lock-name-str mode)))
      @held
      (catch Throwable e
        (release-h2-locks! @held)
        (throw e)))))

(defn- do-with-h2-cluster-locks*
  "h2 counterpart of [[do-with-cluster-locks*]]; `entered` carries the same meaning.

  Only *acquisition* is retried here, where the row-lock branch retries the whole thing. That branch's
  body rides a transaction that rolls back before a re-run, so re-running it is safe; this one has no
  transaction (see [[with-cluster-lock]]), so a re-run would re-apply work that already committed —
  the `:retry-transient?` statistics writers would double-count. Nothing is lost by not retrying:
  `:retry-transient?` exists for multi-master row-lock appdbs, which h2 is not."
  [locks timeout-seconds config entered thunk]
  (check-not-held-detached! (map :lock-name-str locks))
  (let [held (retry/with-retry config (acquire-h2-locks! locks timeout-seconds))]
    (vreset! entered true)
    (try
      (thunk)
      (finally
        (release-h2-locks! held)))))

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
    (let [{:keys [lock locks timeout-seconds retry-config retry-transient?]} opts]
      (when (and lock locks)
        (throw (ex-info "Cluster-lock opts must specify exactly one of :lock or :locks"
                        {:opts opts})))
      (when-not (or lock locks)
        (throw (ex-info "Cluster-lock opts must specify :lock or :locks" {:opts opts})))
      (cond-> {:locks            (if lock
                                   [(normalize-lock-spec (if (map? lock)
                                                           lock
                                                           {:lock lock :mode (or (:mode opts) :exclusive)}))]
                                   (mapv normalize-lock-spec locks))
               :retry-transient? (boolean retry-transient?)}
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
    `:mode`, `:timeout-seconds`, `:retry-config`, and `:retry-transient?`:

      {:lock ::foo}                                     ; exclusive on ::foo
      {:lock ::foo :mode :share}                        ; shared on ::foo
      {:lock ::foo :timeout-seconds 5}                  ; with timeout override
      {:lock ::foo :retry-transient? true}              ; also retry deadlocks (see below)
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

  `:timeout-seconds` bounds how long each attempt waits to *acquire*, not how long the
  body may hold the lock — a hold lasts as long as the body runs. 0 means wait
  indefinitely. Acquisition is retried per `:retry-config`, so the wall-clock budget
  before contention is reported is roughly
  `(max-retries + 1) * timeout-seconds + max-retries * delay-ms`.

  On an h2 appdb only acquisition is retried: the body has no transaction to roll back
  (see [[with-cluster-lock]]), so re-running it would re-apply committed work. Acquisition
  timeout, retry budget and error shape are the same on both."
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
             ;; 0 means "wait indefinitely", matching `.setQueryTimeout`
             [:timeout-seconds  {:optional true} [:int {:min 0}]]
             [:retry-config     {:optional true} [:ref ::retry/retry-overrides]]
             [:retry-transient? {:optional true} :boolean]]]
   thunk :- ifn?]
  (let [{:keys [locks timeout-seconds retry-config retry-transient?]
         :or   {timeout-seconds cluster-lock-timeout-seconds}} (parse-opts opts)
        ;; Set once all locks are held, so the catch below can tell "could not acquire" from "the body
        ;; failed". Without it a retryable error thrown by `thunk` — an appdb statement timeout, say — was
        ;; wrapped as contention, and callers that skip on :lock-names dropped a genuine failure silently.
        entered (volatile! false)
        config  (assoc (merge default-retry-config retry-config)
                       :retry-if (fn [_ e] (retry-if-error? retry-transient? e)))]
    (try
      (if (= (mdb.connection/db-type) :h2)
        ;; h2 does not respect the query timeout when taking the lock and is not cross-process, so we
        ;; use an in-process ReentrantReadWriteLock per lock name. It runs its own acquisition retry.
        (do-with-h2-cluster-locks* locks timeout-seconds config entered thunk)
        (retry/with-retry config (do-with-cluster-locks* locks timeout-seconds entered thunk)))
      (catch Throwable e
        ;; only a genuine lock-acquisition failure gets the "Failed to obtain cluster lock" wrapper;
        ;; an exhausted transient body error (e.g. deadlock) propagates raw so the message stays truthful.
        (if (and (retryable? e) (not @entered))
          (throw (ex-info (str "Failed to obtain cluster lock: "
                               (str/join ", " (map :lock-name-str locks)))
                          {:lock-names (mapv :lock-name-str locks)
                           :retries (:max-retries config)}
                          e))
          (throw e))))))

(defmacro with-cluster-lock
  "Run `body` in a transaction that tries to take a lock from the metabase_cluster_lock table of
  the specified name to coordinate concurrency with other metabase instances sharing the appdb.
  (On an h2 appdb the lock is an in-process read-write lock and no transaction is involved.)

  `lock-options` may be a lock-name keyword, or an options map
  `{:lock, :locks, :mode, :timeout-seconds, :retry-config, :retry-transient?}` —
  see [[do-with-cluster-lock]] for the full description of each.

  For long-running work whose appdb writes should commit incrementally instead of riding the lock's
  transaction, see [[with-detached-cluster-lock]]."
  ([lock-options & body]
   `(do-with-cluster-lock ~lock-options (fn [] ~@body))))

(defn- acquire-with-retry!
  "Run `acquire!` under `config`'s retry policy, wrapping an exhausted acquisition failure in the standard
  `:lock-names` ex-info. Returns `acquire!`'s value.

  Only acquisition goes through here — unlike [[do-with-cluster-lock]] there is no `entered` flag to
  check, because the detached body deliberately runs outside this retry."
  [lock-name-str config acquire!]
  (try
    (retry/with-retry config (acquire!))
    (catch Throwable e
      (if (retryable? e)
        (throw (ex-info (str "Failed to obtain cluster lock: " lock-name-str)
                        {:lock-names [lock-name-str]
                         :retries    (:max-retries config)}
                        e))
        (throw e)))))

(mu/defn do-with-detached-cluster-lock
  "Impl for [[with-detached-cluster-lock]]."
  [{:keys [lock timeout-seconds retry-config]
    :or   {timeout-seconds cluster-lock-timeout-seconds}}
   :- [:map
       [:lock            :keyword]
       [:timeout-seconds {:optional true} [:int {:min 0}]]
       [:retry-config    {:optional true} [:ref ::retry/retry-overrides]]]
   thunk :- ifn?]
  (let [lock-name-str (keyword->lock-name-str lock)
        config        (merge default-retry-config retry-config)]
    (check-not-held-detached! [lock-name-str])
    (if (= (mdb.connection/db-type) :h2)
      ;; the h2 in-process lock never holds a transaction, so it is already 'detached'. It still goes
      ;; through the retry and :lock-names wrapping, so a contended detached hold looks the same on h2 as
      ;; on a row-lock appdb rather than failing after a single bounded wait.
      (let [held (acquire-with-retry! lock-name-str config
                                      #(acquire-h2-locks! [{:lock-name-str lock-name-str :mode :exclusive}]
                                                          timeout-seconds))]
        ;; as on the row-lock branch below, the body runs outside the retry
        (try
          (binding [*detached-locks-held* (conj *detached-locks-held* lock-name-str)]
            (thunk))
          (finally
            (release-h2-locks! held))))
      (mdb.connection/with-unshared-connection [conn]
        (.setAutoCommit ^Connection conn false)
        (acquire-with-retry! lock-name-str config
                             (fn []
                               ;; clear the aborted transaction a failed previous attempt leaves behind
                               (.rollback ^Connection conn)
                               (acquire-lock-row! conn lock-name-str timeout-seconds :exclusive)))
        ;; the body runs outside the retry above, so its errors are never retried (its work has already
        ;; committed) and never mistaken for acquisition failure
        (let [result (binding [*detached-locks-held* (conj *detached-locks-held* lock-name-str)]
                       (thunk))]
          ;; releases the row lock; on a body throw the pool's check-in rollback releases it instead
          (.commit ^Connection conn)
          result)))))

(defmacro with-detached-cluster-lock
  "Like [[with-cluster-lock]], but holds the (exclusive) lock row on a dedicated connection
  (see [[metabase.app-db.connection/with-unshared-connection]]) while `body` runs on ordinary pooled
  connections: `body`'s appdb work commits incrementally in its own short transactions instead of riding
  one long transaction that holds the lock. The lock is released when `body` completes (commit) or
  throws (pool check-in rollback) — but `body`'s already-committed work is NOT rolled back by a throw,
  so only use this for long-running work that is idempotent/self-healing (the audit boot pipeline).

  Not reentrant: re-acquiring a lock this scope already holds detached — in either detached or
  transactional form — throws instead of self-deadlocking against the dedicated connection. (The
  reverse — requesting a detached hold on a lock this scope holds transactionally — is not detected
  and times out; don't.) Taking *different* locks inside `body` works normally. Hold duration is
  bounded by the connection pool's limits: c3p0's `unreturnedConnectionTimeout`, when configured,
  destroys the connection and silently releases the lock, and with the appdb checkout timeout set to
  0 (wait forever) a body blocked on pool checkout holds the lock indefinitely.

  `opts` is `{:lock, :timeout-seconds, :retry-config}` as in [[with-cluster-lock]]; retries apply to
  lock acquisition only, never to `body`."
  [opts & body]
  `(do-with-detached-cluster-lock ~opts (fn [] ~@body)))

(def card-statistics-lock
  "A shared keyword that any method doing a batch update of card statistics can use for the cluster lock"
  ::statistics-lock)
