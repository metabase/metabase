(ns metabase.app-db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them."
  (:require
   [clojure.core.async.impl.dispatch :as a.impl.dispatch]
   [metabase.app-db.connection-pool-setup :as connection-pool-setup]
   [metabase.app-db.env :as mdb.env]
   [metabase.config.core :as config]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.connection :as t2.conn]
   [toucan2.jdbc.connection :as t2.jdbc.conn]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "Counter for [[unique-identifier]] -- this is a simple counter rather that [[java.util.UUID/randomUUID]]
  so we don't waste precious entropy on launch generating something that doesn't need to be random (it just needs to be
  unique)"}
  application-db-counter
  (atom 0))

(p/defrecord+ ApplicationDB [^clojure.lang.Keyword db-type
                             ^javax.sql.DataSource data-source
                             ;; Dedicated (smaller) connection pool for the Quartz JDBC job store, so job-store
                             ;; operations can't be starved by application code saturating the main pool. When the
                             ;; ApplicationDB is created without pooling (`:create-pool?` false, e.g. for test DBs)
                             ;; this is just `data-source` itself. Access it via [[quartz-data-source]], which
                             ;; respects `lock` below.
                             ^javax.sql.DataSource quartz-data-source
                             ;; used by [[metabase.app-db.setup-db!]] and [[metabase.app-db.db-is-set-up?]] to record whether
                             ;; the usual setup steps have been performed (i.e., running Liquibase and Clojure-land data
                             ;; migrations).
                             ^clojure.lang.Atom    status
                             ;; A unique identifier generated for this specific application DB. Use this as a
                             ;; memoization/cache key. See [[unique-identifier]] for more information.
                             id
                             ;; Reentrant read-write lock for GETTING new connections. Lock doesn't track whether any
                             ;; existing connections are open! Holding the write lock will however prevent any NEW
                             ;; connections from being acquired.
                             ;;
                             ;; This is a reentrant read-write lock, which means any number of read locks are allowed at
                             ;; the same time, but the write lock is exclusive. So if you want to prevent anyone from
                             ;; getting new connections, lock the write lock.
                             ;;
                             ;; The main purpose of this is to power [[metabase.testing-api.api]] which allows you to
                             ;; reset the application DB with data from a SQL dump -- during the restore process it is
                             ;; important that we do not allow anyone to access the DB.
                             ^ReentrantReadWriteLock lock]
  javax.sql.DataSource
  (getConnection [_]
    (try
      (.. lock readLock lock)
      (.getConnection data-source)
      (finally
        (.. lock readLock unlock))))

  (getConnection [_ user password]
    (try
      (.. lock readLock lock)
      (.getConnection data-source user password)
      (finally
        (.. lock readLock unlock)))))

(alter-meta! #'->ApplicationDB assoc :private true)
(alter-meta! #'map->ApplicationDB assoc :private true)

(def ^:private initial-db-status nil)

(defn application-db
  "Create a new Metabase application database (type and [[javax.sql.DataSource]]). For use in combination
  with [[*application-db*]]:

    (binding [mdb.connection/*application-db* (mdb.connection/application-db :h2 my-data-source)]
      ...)

  Options:

  * `:create-pool?` -- whether to create a c3p0 connection pool data source for this application database (plus a
    dedicated Quartz pool -- see [[metabase.app-db.connection-pool-setup/quartz-connection-pool-data-source]]).
    Default: `false`. Requires an unpooled `data-source`: passing an already-pooled one throws. You should only do
    this for application DBs that are expected to be long-lived; for test DBs that will be destroyed at the end of
    the test it's hardly worth it."
  ^ApplicationDB [db-type data-source & {:keys [create-pool?], :or {create-pool? false}}]
  ;; this doesn't use [[schema.core/defn]] because [[schema.core/defn]] doesn't like optional keyword args
  {:pre [(#{:h2 :mysql :postgres} db-type)
         (instance? javax.sql.DataSource data-source)]}
  (map->ApplicationDB
   {:db-type     db-type
    :data-source (if create-pool?
                   (connection-pool-setup/connection-pool-data-source db-type data-source)
                   data-source)
    :quartz-data-source (if create-pool?
                          (connection-pool-setup/quartz-connection-pool-data-source db-type data-source)
                          data-source)
    :status      (atom initial-db-status)
    ;; for memoization purposes. See [[unique-identifier]] for more information.
    :id          (swap! application-db-counter inc)
    :lock        (ReentrantReadWriteLock.)}))

(def ^:dynamic ^ApplicationDB *application-db*
  "Type info and [[javax.sql.DataSource]] for the current Metabase application database. Create a new instance
  with [[application-db]]."
  (application-db mdb.env/db-type mdb.env/data-source :create-pool? true))

(defn db-type
  "Keyword type name of the application DB. Matches corresponding db-type name e.g. `:h2`, `:mysql`, or `:postgres`."
  []
  (.db-type *application-db*))

(defn quoting-style
  "HoneySQL quoting style to use for application DBs of the given type. Note for H2 application DBs we automatically
  uppercase all identifiers (since this is H2's default behavior) whereas in the SQL QP we stick with the case we got
  when we synced the DB."
  [db-type]
  (case db-type
    :postgres :ansi
    :h2       :h2
    :mysql    :mysql))

;; TODO -- you can just use [[*application-db*]] directly, we can probably get rid of this and use that directly instead
(defn data-source
  "Get a data source for the application DB, derived from environment variables. Usually this should be a pooled data
  source (i.e. a c3p0 pool) -- but in test situations it might not be."
  ^javax.sql.DataSource []
  (.data-source *application-db*))

(defn quartz-data-source
  "Get a [[javax.sql.DataSource]] for the Quartz JDBC job store, backed by the current [[*application-db*]]'s
  dedicated Quartz connection pool (or its regular data source if it was created without pooling).

  Like connections acquired through the [[ApplicationDB]] itself, acquiring a connection through this takes the
  application DB's read lock, so the testing API can block new connections while restoring the app DB."
  ^javax.sql.DataSource []
  (let [^ApplicationDB app-db            *application-db*
        ^ReentrantReadWriteLock lock     (.lock app-db)
        ^javax.sql.DataSource data-source (.quartz-data-source app-db)]
    (reify javax.sql.DataSource
      (getConnection [_]
        (try
          (.. lock readLock lock)
          (.getConnection data-source)
          (finally
            (.. lock readLock unlock))))
      (getConnection [_ user password]
        (try
          (.. lock readLock lock)
          (.getConnection data-source user password)
          (finally
            (.. lock readLock unlock)))))))

;; I didn't call this `id` so there's no confusing this with a data warehouse [[metabase.warehouses.models.database]] instance --
;; it's a number that I don't want getting mistaken for an `Database` `id`. Also the fact that it's an Integer is not
;; something callers of this function really need to be concerned about
(defn unique-identifier
  "Unique identifier for the Metabase application DB. This value will stay the same as long as the application DB stays
  the same; if the application DB is dynamically rebound, this will return a new value.

  For normal memoization you can use [[memoize-for-application-db]]; you should only need to use this directly for TTL
  memoization with [[clojure.core.memoize]] or other special cases. See [[metabase.driver.util/database->driver*]] for
  an example of using this for TTL memoization."
  []
  (.id *application-db*))

(methodical/defmethod t2.conn/do-with-connection :default
  [_connectable f]
  (t2.conn/do-with-connection *application-db* f))

(def ^:private ^:dynamic *transaction-depth* 0)

(defn in-transaction?
  "Whether we are currently in a transaction."
  []
  (pos? *transaction-depth*))

;; Accumulate 0-arity thunks to run just before / just after the outermost transaction commits. Each is
;; bound to a fresh atom when the outermost transaction starts (see [[do-with-transaction]]) and shared by
;; the whole nested-transaction tree; nil outside any transaction.
(def ^:private ^:dynamic *before-commit-callbacks* nil)
(def ^:private ^:dynamic *after-commit-callbacks* nil)

;; Holds an atom set to true when a rollback fails and leaves behind writes that should have been discarded. The atom
;; is shared across the transaction tree so that the outermost scope cannot commit those writes, even if an
;; intermediate scope catches the rollback error.
;;
;; Once set it stays set. Clearing it correctly would mean tracking the depth that failed: a sibling scope rolling
;; back to its own, later savepoint does not discard an earlier scope's writes.
(def ^:private ^:dynamic *rollback-required* nil)

;; Open savepoints in creation order, each with whether its scope has finished. Shared by the tree, including threads
;; that inherit its bindings. Releasing a savepoint destroys every later one, so a scope may only release once no
;; later scope is still running; a sibling thread's early release would otherwise leave that scope nothing to release
;; or roll back to, and on postgres the failed release aborts the transaction.
(def ^:private ^:dynamic *open-savepoints* nil)

(defn- set-savepoint! [^java.sql.Connection connection]
  (let [open *open-savepoints*]
    (locking open
      (let [savepoint (.setSavepoint connection)]
        (swap! open conj {:savepoint savepoint, :finished? false})
        savepoint))))

(defn- rollback-to-savepoint!
  "Roll back to `savepoint` and forget it and everything after it, which no longer exists."
  [^java.sql.Connection connection savepoint]
  (let [open *open-savepoints*]
    (locking open
      (try
        (.rollback connection savepoint)
        (finally
          (swap! open (fn [entries]
                        (into [] (take-while #(not (identical? (:savepoint %) savepoint)) entries)))))))))

(defn- release-finished-savepoints!
  "Mark `savepoint` finished and release the earliest savepoint with no unfinished successor, which frees the later
  finished ones with it."
  [^java.sql.Connection connection savepoint]
  (let [open *open-savepoints*]
    (locking open
      (let [entries (swap! open (fn [entries]
                                  (mapv #(cond-> % (identical? (:savepoint %) savepoint) (assoc :finished? true))
                                        entries)))
            first-releasable (loop [i (count entries)]
                               (cond
                                 (zero? i)                               0
                                 (not (:finished? (nth entries (dec i)))) i
                                 :else                                   (recur (dec i))))]
        (when (< first-releasable (count entries))
          ;; copy rather than keep the subvec view of the discarded entries
          (reset! open (into [] (subvec entries 0 first-releasable)))
          (try
            (.releaseSavepoint connection (:savepoint (nth entries first-releasable)))
            (catch Throwable e
              ;; Either the savepoint is already gone -- DDL commits implicitly on H2 and MySQL -- or, on postgres,
              ;; the transaction is already aborted because a scope swallowed a SQL error. Nothing to undo either
              ;; way, but the aborted case is worth surfacing: postgres silently turns the outermost commit into a
              ;; rollback, so this is the only signal that the tree's writes and after-commit callbacks are about to
              ;; diverge.
              (log/warnf "Failed to release savepoint: %s" (ex-message e)))))))))

(def ^:dynamic *transaction-state*
  "When non-nil, an atom holding a map of arbitrary per-transaction data, shared by the whole
  nested-transaction tree and thrown away when the outermost transaction ends. Any subsystem can stash
  namespaced keys here to pass data between the transaction body and its before-/after-commit callbacks
  (e.g. the mq outbox stashes messages to insert before commit and the rows to publish after commit).
  Bound to a fresh atom at the outermost transaction boundary; nil outside any transaction."
  nil)

(defn transaction-state
  "Returns the current per-transaction [[*transaction-state*]] atom, or nil if not in a transaction."
  []
  *transaction-state*)

(defn do-before-commit
  "Run `thunk` just before the current outermost transaction commits — while the transaction is still
  open, so any DB writes it makes commit atomically with it, and a throw from it rolls the whole
  transaction back. Outside a transaction, runs `thunk` immediately. Mirror of [[do-after-commit]] for
  work that must land *inside* the committing transaction."
  [thunk]
  (if-let [callbacks *before-commit-callbacks*]
    (do (swap! callbacks conj thunk) nil)
    (thunk)))

(defn do-after-commit
  "Run `thunk` after the current outermost transaction commits successfully — never on rollback.
  Outside a transaction (autocommit), runs `thunk` immediately — the surrounding write already committed.
  Use to *schedule* post-commit work — enqueue async work, fire a `future`, publish an event — that must
  observe committed state (e.g. a reconcile that reads the row).
  Do not do synchronous DB I/O in `thunk`: it runs while the transaction's connection is still checked out,
  so a query here would hold a second connection and can deadlock a saturated pool. Hand DB work to the
  async job you schedule, which acquires its own connection."
  [thunk]
  (if-let [callbacks *after-commit-callbacks*]
    (do (swap! callbacks conj thunk) nil)
    (thunk)))

(defn- run-after-commit-callbacks! [callbacks]
  ;; Bind the transaction connection and callback accumulator to nil so they are not conveyed into async work
  ;; (e.g. a reconcile `future`) a callback may start: that work must acquire its own connection rather than
  ;; reuse this transaction's connection after it returns to the pool, and a do-after-commit it makes must run
  ;; immediately rather than enqueue into this now-drained accumulator.
  (binding [t2.conn/*current-connectable* nil
            *transaction-depth*           0
            *after-commit-callbacks*      nil]
    (doseq [thunk @callbacks]
      ;; the transaction already committed; a failing callback must not unwind it
      (try (thunk) (catch Throwable t (log/errorf "after-commit callback failed: %s" (ex-message t)))))
    (reset! callbacks [])))

(defn- discard-callbacks-after!
  "Truncate the `callbacks` atom back to its first `n` entries, dropping any that a now-rolling-back
  nested transaction registered after its savepoint so they never fire at outer-commit time."
  [callbacks n]
  (when callbacks
    (swap! callbacks
           (fn [cbs]
             ;; copy rather than return the subvec view, which would retain the discarded callbacks (and their
             ;; captured closures) through the backing array until the outer transaction finishes
             (into [] (subvec cbs 0 (min n (count cbs))))))))

(defn- do-transaction [^java.sql.Connection connection rollback-only? f]
  ;; Set when a connection rollback fails and leaves pending writes. Restoring autocommit would commit those writes,
  ;; so this flag prevents the restore and leaves cleanup to the pool when the connection is checked in.
  (let [discard-failed?      (volatile! false)
        rollback-connection! (fn []
                               (try
                                 (.rollback connection)
                                 (catch Throwable rollback-e
                                   ;; This matters only when the transaction still contains writes that must be
                                   ;; discarded. After a successful savepoint rollback, there is nothing left here
                                   ;; to commit.
                                   ;; TODO (Chris 2026-08-18) -- A caller-supplied connection is returned to its owner
                                   ;; with these writes still pending. We prevent an accidental commit by leaving
                                   ;; autocommit disabled, but cannot force the owner to roll them back.
                                   (when (some-> *rollback-required* deref)
                                     (vreset! discard-failed? true))
                                   (log/warnf "Failed to roll back transaction: %s"
                                              (ex-message rollback-e)))))]
    (letfn [(thunk []
              (let [savepoint      (set-savepoint! connection)
                    before-count   (some-> *before-commit-callbacks* deref count)
                    after-count    (some-> *after-commit-callbacks* deref count)
                    state-snapshot (when (and *transaction-state* (> *transaction-depth* 1))
                                     @*transaction-state*)]
                (letfn [(rollback! []
                          ;; Rollback callbacks and transaction state together with the DB writes, whether the rollback
                          ;; is explicit or caused by an exception.
                          (when after-count  (discard-callbacks-after! *after-commit-callbacks*  after-count))
                          (when before-count (discard-callbacks-after! *before-commit-callbacks* before-count))
                          ;; Restore the state even if rollback throws. An outer scope must not see state from this one.
                          (try
                            (rollback-to-savepoint! connection savepoint)
                            (catch Throwable rollback-e
                              ;; The writes remain pending. No enclosing scope may commit them.
                              ;; A vanished savepoint still counts as a rollback failure. DDL committing implicitly,
                              ;; or a server breaking a deadlock, ends the transaction and discards the writes so far,
                              ;; but anything written after that sits in a new transaction and is still pending.
                              (some-> *rollback-required* (reset! true))
                              (throw rollback-e))
                            (finally
                              (when state-snapshot
                                (reset! *transaction-state* state-snapshot)))))
                        (rollback-after-error! [txn-e]
                          (try
                            (rollback!)
                            (catch Exception rollback-e
                              (throw (ex-info
                                      (str "Error rolling back after previous error: " (ex-message txn-e))
                                      {:rollback-error rollback-e}
                                      txn-e))))
                          (throw txn-e))]
                  (let [result (try
                                 (f connection)
                                 (catch Throwable txn-e
                                   (rollback-after-error! txn-e)))]
                    (cond
                      rollback-only?
                      (do
                        (try
                          (rollback!)
                          (catch Exception rollback-e
                            (if (= *transaction-depth* 1)
                              ;; The body committed the transaction, so the savepoint is gone. H2 and MySQL do this
                              ;; implicitly for DDL. Those writes are already durable; discard anything still pending.
                              (let [message (format (str "Could not roll back a rollback-only transaction (%s)."
                                                         " Something in it committed the transaction -- DDL commits"
                                                         " implicitly on H2 and MySQL -- so its writes up to that"
                                                         " point are already durable.")
                                                    (ex-message rollback-e))]
                                ;; Every top-level `with-temp` is one of these scopes, so in a test the durable rows
                                ;; leak into every later test. Fail here rather than in the unrelated test that
                                ;; trips over them. Throwing covers every way the savepoint can go -- raw SQL DDL,
                                ;; HoneySQL DDL, a deadlock -- which a guard on the SQL we build cannot: callers
                                ;; such as search's `drop-table!` send raw SQL over the ambient connection.
                                ;; The exceptional exit below rolls the connection back.
                                (when config/is-test?
                                  (throw (ex-info (str message " Those writes will leak into every later test."
                                                       " Run the DDL outside the rollback-only scope, or on its"
                                                       " own connection.")
                                                  {}
                                                  rollback-e)))
                                (log/warn message)
                                (rollback-connection!))
                              ;; In a nested scope, propagate the error. `rollback!` has marked the transaction tree
                              ;; as unsafe to commit.
                              (throw (ex-info "Error rolling back a rollback-only transaction" {} rollback-e)))))
                        [result false])

                      (and (= *transaction-depth* 1) (some-> *rollback-required* deref))
                      (do
                        ;; Discard the entire tree. A scope failed to undo its writes, so do not commit them or
                        ;; return as though the scope succeeded.
                        (rollback-connection!)
                        (throw (ex-info (str "Not committing: a transaction in this tree failed to "
                                             "roll back, so its writes are still present")
                                        {})))

                      (= *transaction-depth* 1)
                      (try
                        ;; Run before-commit callbacks while the top-level transaction is open. Their writes commit
                        ;; atomically with it, and a callback exception rolls back the transaction.
                        (loop []
                          (when-let [callbacks (seq (first (reset-vals! *before-commit-callbacks* [])))]
                            (doseq [cb callbacks] (cb))
                            ;; A before-commit callback may register more callbacks; run those as well.
                            (recur)))
                        ;; A callback can catch a nested rollback failure, so check the failure flag again here.
                        (when (some-> *rollback-required* deref)
                          (throw (ex-info (str "Not committing: a transaction in this tree failed to "
                                               "roll back, so its writes are still present")
                                          {})))
                        (.commit connection)
                        [result true]
                        (catch Throwable txn-e
                          (rollback-after-error! txn-e)))

                      :else
                      (do
                        ;; The nested scope succeeded, so release its savepoint rather than leave it open until the
                        ;; outermost commit destroys it. On postgres each open savepoint is a live subtransaction that
                        ;; every row-visibility check walks, so a long pipeline of nested transactions slows to a
                        ;; crawl. Releasing is not committing: an enclosing rollback still undoes the released work.
                        (release-finished-savepoints! connection savepoint)
                        [result false]))))))]
      ;; Avoid toggling autocommit when the connection is already in a transaction.
      (if (.getAutoCommit connection)
        (try
          (.setAutoCommit connection false)
          (try
            (thunk)
            (catch Throwable t
              ;; Restoring autocommit commits any open transaction. On an exceptional exit, including a failed
              ;; requested rollback, try to discard the transaction before reaching that restore.
              (rollback-connection!)
              (throw t)))
          (finally
            (if @discard-failed?
              ;; The writes remain pending, so leave autocommit disabled and let the pool roll the connection back
              ;; when it is checked in.
              (log/warn (str "Leaving autocommit off: this connection holds writes that could not be"
                             " rolled back, and restoring autocommit would commit them."))
              ;; Do not let a failed autocommit restore mask the original exception.
              (try
                (.setAutoCommit connection true)
                (catch Throwable t
                  (log/warnf "Failed to reset the connection's autocommit flag to true: %s"
                             (ex-message t)))))))
        (thunk)))))

(def ^:private supported-transaction-options
  #{:nested-transaction-rule :rollback-only})

(comment
  ;; in toucan2.jdbc.connection, there is a 'defmethod' for t2.conn/do-with-transaction java.sql.Connection
  ;; since we don't want our implementation to be overwritten, we need to require it here first before defininng ours
  t2.jdbc.conn/keepme)

(methodical/defmethod t2.conn/do-with-transaction java.sql.Connection
  "Support nested transactions without introducing a lock like `next.jdbc` does, as that can cause deadlocks -- see
  https://github.com/seancorfield/next-jdbc/issues/244. Use `Savepoint`s because MySQL only supports nested
  transactions when done this way.

  See also https://metaboat.slack.com/archives/CKZEMT1MJ/p1694103570500929

  Note that these \"nested transactions\" are not the real thing (e.g., as in Oracle):
    - there is only one commit, meaning that every transaction in a tree of transactions can see the changes
      other transactions have made,
    - in the presence of unsynchronized concurrent threads running nested transactions, the effects of rollback
      are not well defined - a rollback will undo all work done by other transactions in the same tree that
      started later.

  With `:rollback-only true`, a successful scope rolls back to its savepoint and discards the callbacks and transaction
  state registered within that scope. This cannot be combined with `:nested-transaction-rule :ignore`, which skips the
  savepoint entirely. Unsupported JDBC transaction options are rejected rather than silently treated as ordinary
  writable transactions."
  [^java.sql.Connection connection
   {:keys [nested-transaction-rule rollback-only] :or {nested-transaction-rule :allow} :as options}
   f]
  ;; Sort so the message and the ex-data name the options in the same order every time.
  (when-let [unsupported-options (not-empty (vec (sort (remove supported-transaction-options (keys options)))))]
    (throw (ex-info (str "Unsupported transaction options: " (pr-str unsupported-options))
                    {:unsupported-options unsupported-options
                     :options             options})))
  ;; `assert` compiles away under `*assert*` false, and this validates a public option.
  (when-not (#{:allow :ignore :prohibit} nested-transaction-rule)
    (throw (ex-info (str "Invalid :nested-transaction-rule: " (pr-str nested-transaction-rule))
                    {:nested-transaction-rule nested-transaction-rule
                     :options                 options})))
  ;; Reject this combination at every depth so a call site behaves consistently wherever it runs.
  (when (and rollback-only (= nested-transaction-rule :ignore))
    (throw (ex-info (str "Cannot combine :rollback-only with :nested-transaction-rule :ignore -- an ignored "
                         "nested transaction has no savepoint to roll back to")
                    {:options options})))
  (cond
    (and (pos? *transaction-depth*)
         (= nested-transaction-rule :ignore))
    (f connection)

    (and (pos? *transaction-depth*)
         (= nested-transaction-rule :prohibit))
    (throw (ex-info "Attempted to create nested transaction with :nested-transaction-rule set to :prohibit"
                    {:options options}))

    :else
    (let [outermost? (zero? *transaction-depth*)
          callbacks  (if outermost? (atom []) *after-commit-callbacks*)
          [result committed?]
          (binding [*transaction-depth*       (inc *transaction-depth*)
                    ;; Create one set of callback accumulators and transaction state for the entire tree.
                    *before-commit-callbacks* (if outermost? (atom []) *before-commit-callbacks*)
                    *transaction-state*       (if outermost? (atom {}) *transaction-state*)
                    *rollback-required*       (if outermost? (atom false) *rollback-required*)
                    *open-savepoints*         (if outermost? (atom []) *open-savepoints*)
                    *after-commit-callbacks*  callbacks]
            (do-transaction connection rollback-only f))]
      (when (and outermost? committed?)
        (run-after-commit-callbacks! callbacks))
      result)))

;;;; Unshared connections
;;;;
;;;; A connection that holds fragile long-lived state -- a streaming result set (postgres portal), a row
;;;; lock held while other work runs -- must not be picked up by ambient connection reuse: a borrower that
;;;; inherits it via [[toucan2.connection/*current-connectable*]] and commits destroys that state (see
;;;; #78238 and the revert of #76645). [[toucan2.connection/unshared-connection!]] makes toucan use such a
;;;; connection only when passed it explicitly, and never advertise it ambiently -- ambient work inside
;;;; `body` resolves to the default connectable and runs on other pooled connections.

(defn do-with-unshared-connection
  "Impl for [[with-unshared-connection]]."
  [f]
  ;; through *application-db* (not the raw data source) so its connection read-lock gate applies
  (with-open [conn (.getConnection *application-db*)]
    (f (t2.conn/unshared-connection! conn))))

(defmacro with-unshared-connection
  "Execute `body` with `conn-binding` bound to a fresh app-db connection that ambient connection reuse can
  never pick up: toucan runs queries and transactions on it when `body` passes it explicitly, but never
  binds it as [[toucan2.connection/*current-connectable*]], so toucan calls that resolve their connection
  ambiently -- including mid-reduction of a long-running query on this connection -- run (and commit) on
  other pooled connections.

  In every other respect this is an ordinary JDBC connection, configured by `body`: e.g. call
  `.setAutoCommit false` for a streaming result set (postgres portal/cursor) or a held row lock. It is
  closed when `body` ends; the pool resets its state (rolling back any unresolved transaction) on check-in.

  Caveat: do not pass the unshared connection to an explicit `t2/with-transaction` while an ambient
  appdb transaction is open on this thread. Nesting depth is tracked per thread, not per connection, so
  the inner call would take a savepoint on this connection that no commit ever follows, and its work
  would silently roll back at check-in.

    (mdb/with-unshared-connection [conn]
      (.setAutoCommit conn false)
      (reduce rf init (t2/reducible-query conn a-huge-query)))"
  [[conn-binding] & body]
  `(do-with-unshared-connection (fn [~conn-binding] ~@body)))

(methodical/defmethod t2.pipeline/transduce-query :before :default
  "Make sure application database calls are not done inside core.async dispatch pool threads. This is done relatively
  early in the pipeline so the stacktrace when this fails isn't super enormous."
  [_rf _query-type₁ _model₂ _parsed-args resolved-query]
  (when (a.impl.dispatch/in-dispatch-thread?)
    (throw (ex-info "Application database calls are not allowed inside core.async dispatch pool threads."
                    {})))
  resolved-query)
