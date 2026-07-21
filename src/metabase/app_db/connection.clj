(ns metabase.app-db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them."
  (:require
   [clojure.core.async.impl.dispatch :as a.impl.dispatch]
   [metabase.app-db.connection-pool-setup :as connection-pool-setup]
   [metabase.app-db.env :as mdb.env]
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

  * `:create-pool?` -- whether to create a c3p0 connection pool data source for this application database if
    `data-source` is not already a pooled data source. Default: `false`. You should only do this for application DBs
    that are expected to be long-lived; for test DBs that will be destroyed at the end of the test it's hardly worth it."
  ^ApplicationDB [db-type data-source & {:keys [create-pool?], :or {create-pool? false}}]
  ;; this doesn't use [[schema.core/defn]] because [[schema.core/defn]] doesn't like optional keyword args
  {:pre [(#{:h2 :mysql :postgres} db-type)
         (instance? javax.sql.DataSource data-source)]}
  (map->ApplicationDB
   {:db-type     db-type
    :data-source (if create-pool?
                   (connection-pool-setup/connection-pool-data-source db-type data-source)
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
      (try (thunk) (catch Throwable t (log/error t "after-commit callback failed"))))
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

(defn- do-transaction [^java.sql.Connection connection f]
  (letfn [(thunk []
            (let [savepoint      (.setSavepoint connection)
                  before-count   (some-> *before-commit-callbacks* deref count)
                  after-count    (some-> *after-commit-callbacks* deref count)
                  state-snapshot (when (and *transaction-state* (> *transaction-depth* 1))
                                   @*transaction-state*)]
              (try
                (let [result (f connection)]
                  (if (= *transaction-depth* 1)
                    (do
                      ;; top-level transaction. Run before-commit callbacks first, while the transaction is
                      ;; still open, so their writes commit atomically with it. They are NOT wrapped in
                      ;; try/catch — a throwing callback must propagate to the catch below and roll back.
                      (loop []
                        (when-let [callbacks (seq (first (reset-vals! *before-commit-callbacks* [])))]
                          (doseq [cb callbacks] (cb))
                          ;; a before-commit callback may register more (before- or after-commit); run those too
                          (recur)))
                      ;; commit; after-commit side effects run after the transaction bindings unwind
                      (.commit connection))
                    ;; nested transaction succeeded; release its savepoint so it doesn't stay open (as a live
                    ;; subtransaction on postgres) for the rest of the outer transaction
                    (.releaseSavepoint connection savepoint))
                  result)
                (catch Throwable txn-e
                  ;; the nested body failed, so its before-/after-commit callbacks must never fire — discard
                  ;; those it registered before rolling back, otherwise a throwing .rollback would leave them
                  ;; in the shared accumulators to run at outer-commit time for data that was rolled back
                  (when after-count  (discard-callbacks-after! *after-commit-callbacks*  after-count))
                  (when before-count (discard-callbacks-after! *before-commit-callbacks* before-count))
                  (try
                    (.rollback connection savepoint)
                    ;; restore transaction-state to its pre-savepoint value so data the rolled-back
                    ;; sub-transaction stashed is discarded and not seen by the outer commit
                    (when state-snapshot
                      (reset! *transaction-state* state-snapshot))
                    (catch Exception rollback-e
                      (throw (ex-info
                              (str "Error rolling back after previous error: " (ex-message txn-e))
                              {:rollback-error rollback-e}
                              txn-e))))
                  (throw txn-e)))))]
    ;; optimization: don't set and unset autocommit if it's already false
    (if (.getAutoCommit connection)
      (try
        (.setAutoCommit connection false)
        (thunk)
        (finally
          ;; prevent a failing .setAutoCommit call from masking the original exception
          (try
            (.setAutoCommit connection true)
            (catch Throwable t
              (log/warn t "Failed to reset the connection's autocommit flag to true")))))
      (thunk))))

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
      started later."
  [^java.sql.Connection connection {:keys [nested-transaction-rule] :or {nested-transaction-rule :allow} :as options} f]
  (assert (#{:allow :ignore :prohibit} nested-transaction-rule))
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
          result     (binding [*transaction-depth*       (inc *transaction-depth*)
                               ;; one set of accumulators + state for the whole tree, created at the outermost txn
                               *before-commit-callbacks* (if outermost? (atom []) *before-commit-callbacks*)
                               *transaction-state*       (if outermost? (atom {}) *transaction-state*)
                               *after-commit-callbacks*  callbacks]
                       (do-transaction connection f))]
      (when outermost?
        (run-after-commit-callbacks! callbacks))
      result)))

(methodical/defmethod t2.pipeline/transduce-query :before :default
  "Make sure application database calls are not done inside core.async dispatch pool threads. This is done relatively
  early in the pipeline so the stacktrace when this fails isn't super enormous."
  [_rf _query-type₁ _model₂ _parsed-args resolved-query]
  (when (a.impl.dispatch/in-dispatch-thread?)
    (throw (ex-info "Application database calls are not allowed inside core.async dispatch pool threads."
                    {})))
  resolved-query)
