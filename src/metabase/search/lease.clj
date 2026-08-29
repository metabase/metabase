(ns metabase.search.lease
  "An app-db-backed lease for full search reindexes.

  Lease lifecycle operations are short autocommit statements. When a caller already owns an ambient app-db
  transaction they use a lazy, isolated one-connection pool; otherwise they use the ordinary app-db connection path.
  Protected mutations fence ownership on their own connection, in the same transaction as the mutation, unless the
  lease was acquired inside a caller's transaction; then they join that transaction (see
  [[do-with-mutation-connection]])."
  (:require
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 DataSources PoolBackedDataSource)
   (java.sql Connection SQLException)))

(set! *warn-on-reflection* true)

(def ^:dynamic *lease-duration*
  "How long a lease remains valid without a successful heartbeat."
  (t/minutes 10))

(def ^:dynamic *heartbeat-interval-ms*
  "How often an acquired lease is renewed while its reindex is running."
  60000)

(def ^:dynamic *acquire-retry-interval-ms*
  "How often a waiting caller retries a busy lease."
  1000)

(def ^:dynamic *acquire-timeout-ms*
  "How long a waiting caller keeps retrying a busy lease before giving up."
  5000)

(def ^:dynamic *lease-context*
  "The claim and local lost state for the reindex running on this thread. Nil outside a leased reindex."
  nil)

(defn leased?
  "Whether the current thread is executing inside [[do-with-lease]]."
  []
  (some? *lease-context*))

(defonce ^:private coordination-pool (atom nil))

(defn- configured-site-locale []
  (binding [i18n/*site-locale-override* nil]
    (i18n/site-locale-string)))

(defn coordinates
  "The serialization coordinate for `engine` at the current search specification and effective site locale."
  [engine]
  {:engine      (name engine)
   :version     (search.spec/index-version-hash)
   :lang_code   (i18n/site-locale-string)
   ;; Keep the configured locale separately so an intentional outer locale override is not mistaken for a setting
   ;; change while the rebuild is running.
   :site-locale (configured-site-locale)})

(defn- where-coordinate [coordinate]
  (select-keys coordinate [:engine :version :lang_code]))

(defn- coordination-data-source
  "Return the isolated one-slot pool for the currently bound application database."
  []
  (let [app-db-id (mdb/unique-identifier)]
    (locking coordination-pool
      (let [{cached-id :app-db-id, ^PoolBackedDataSource cached-pool :pool, cached-gated :gated} @coordination-pool]
        (if (= cached-id app-db-id)
          cached-gated
          ;; The pool is built over the raw app-db data source, so gate it behind the app db's connection read lock
          ;; ourselves; otherwise a snapshot restore could not keep heartbeats from opening connections.
          (let [pool  (mdb/single-connection-pool-data-source (mdb/db-type) (mdb/data-source))
                gated (mdb/gated-data-source pool)]
            (reset! coordination-pool {:app-db-id app-db-id, :pool pool, :gated gated})
            (when cached-pool
              (try
                (locking mdb/c3p0-pool-monitor
                  (DataSources/destroy cached-pool))
                (catch Throwable e
                  (log/warnf "Failed to destroy the previous search lease connection pool: %s" (ex-message e)))))
            gated))))))

(defn- do-with-lifecycle-connection
  "Run a short autocommit lease lifecycle operation.

  An ambient app-db transaction already owns a main-pool connection, so use the isolated pool in that case. All SQL
  inside `f` resolves to the explicitly checked-out connection."
  [f]
  (let [connectable (when (mdb/in-transaction?)
                      (coordination-data-source))]
    ;; A nil connectable reuses this thread's current connection, or the normal app-db pool when there is none.
    (t2/with-connection [^Connection conn connectable]
      (when-not (.getAutoCommit conn)
        (throw (ex-info "Search lease lifecycle connection unexpectedly has auto-commit disabled"
                        {:type ::non-autocommit-lifecycle-connection})))
      (f conn))))

(def ^:private db-now-expr
  ^:allow-raw-sql [:raw "CURRENT_TIMESTAMP"])

(defn- db-expiry-expr
  "HoneySQL expression for the lease expiry one [[*lease-duration*]] after the app database's current time."
  []
  (let [millis (.toMillis ^java.time.Duration *lease-duration*)]
    ^:allow-raw-sql
    [:raw (case (mdb/db-type)
            :postgres (format "CURRENT_TIMESTAMP + (%d * INTERVAL '1 millisecond')" millis)
            :mysql    (format "TIMESTAMPADD(MICROSECOND, %d, CURRENT_TIMESTAMP)" (* millis 1000))
            :h2       (format "DATEADD('MILLISECOND', %d, CURRENT_TIMESTAMP)" millis))]))

(defn- db-times
  "Read the app database's current time and the corresponding lease expiry without converting JDBC time types."
  [conn]
  (let [millis (.toMillis ^java.time.Duration *lease-duration*)]
    (t2/query-one conn
                  (case (mdb/db-type)
                    :postgres ["SELECT CURRENT_TIMESTAMP AS now, CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond') AS expires_at"
                               millis]
                    :mysql    ["SELECT CURRENT_TIMESTAMP AS now, TIMESTAMPADD(MICROSECOND, ?, CURRENT_TIMESTAMP) AS expires_at"
                               (* millis 1000)]
                    :h2       ["SELECT CURRENT_TIMESTAMP AS now, DATEADD('MILLISECOND', ?, CURRENT_TIMESTAMP) AS expires_at"
                               millis]))))

(defn- duplicate-key-violation?
  [error]
  (loop [error error]
    (cond
      (nil? error)
      false

      (instance? SQLException error)
      (let [^SQLException sql-error error]
        (or (= "23505" (.getSQLState sql-error))
            ;; MySQL and MariaDB use the generic integrity-constraint state and vendor code 1062 for duplicate keys.
            (and (= "23000" (.getSQLState sql-error))
                 (= 1062 (.getErrorCode sql-error)))
            (recur (ex-cause error))))

      :else
      (recur (ex-cause error)))))

(defn- try-insert-claim!
  [conn claim]
  (try
    (t2/insert! :conn conn :search_index_lease
                (select-keys claim [:engine :version :lang_code :owner
                                    :acquired_at :last_renewed_at :expires_at]))
    true
    (catch Exception e
      (if (duplicate-key-violation? e)
        false
        (throw e)))))

(defn try-acquire!
  "Try to acquire `coordinate`, returning its owner claim or nil when a live owner already holds it.

  The expired-owner update and absent-row insert are individually atomic autocommit statements. A conditional update
  elects one expired-row taker; the coordinate primary key elects one concurrent inserter."
  [coordinate]
  (do-with-lifecycle-connection
   (fn [conn]
     (let [attempt-start-ns (System/nanoTime)
           owner            (str (random-uuid))
           input-coordinate coordinate
           coordinate       (where-coordinate input-coordinate)
           {:keys [now expires_at]} (db-times conn)
           claim            (assoc coordinate
                                   :owner owner
                                   :site-locale (or (:site-locale input-coordinate) (configured-site-locale))
                                   :acquired_at now
                                   :last_renewed_at now
                                   :expires_at expires_at
                                   :last-renewal-start-ns attempt-start-ns)
           stolen?          (pos? (t2/update! :conn conn :search_index_lease
                                              (assoc coordinate :expires_at [:<= now])
                                              (select-keys claim [:owner :acquired_at
                                                                  :last_renewed_at :expires_at])))]
       (cond
         stolen?
         (assoc claim :taken-over? true)

         (try-insert-claim! conn claim)
         claim

         :else
         nil)))))

(defn- renew-on-current-connection!
  "Renew in one statement so a per-batch fence costs a single round trip."
  [conn {:keys [owner] :as claim}]
  (pos? (t2/update! :conn conn :search_index_lease
                    (assoc (where-coordinate claim) :owner owner :expires_at [:> db-now-expr])
                    {:last_renewed_at db-now-expr, :expires_at (db-expiry-expr)})))

(defn renew!
  "Renew `claim` with a short autocommit operation. Returns false if it expired or changed owner."
  [claim]
  (do-with-lifecycle-connection (fn [conn] (renew-on-current-connection! conn claim))))

(defn release!
  "Release `claim` with a short autocommit operation, only if it still belongs to this owner."
  [{:keys [owner] :as claim}]
  (do-with-lifecycle-connection
   (fn [conn]
     (let [{:keys [engine version lang_code]} (where-coordinate claim)]
       (pos? (t2/delete! :conn conn :search_index_lease
                         :engine engine :version version :lang_code lang_code :owner owner))))))

(defn- labels [claim event]
  {:engine (:engine claim), :event event})

(defn- record-event! [claim event]
  (try
    (analytics/inc! :metabase-search/reindex-lease-events (labels claim event))
    (catch Throwable e
      (log/warnf "Failed to record search lease event %s: %s" event (ex-message e)))))

(defn- observe-held-duration! [claim timer]
  (try
    (analytics/observe! :metabase-search/reindex-lease-held-duration-ms
                        {:engine (:engine claim)}
                        (u/since-ms timer))
    (catch Throwable e
      (log/warnf "Failed to record search lease duration: %s" (ex-message e)))))

(defn- mark-lost!
  [{:keys [claim lost?]}]
  (when (compare-and-set! lost? false true)
    (record-event! claim :lost)))

(defn- lost-ex
  ([claim]
   (lost-ex claim nil))
  ([claim cause]
   (ex-info "Search reindex lease was lost; refusing to continue"
            {:type ::lease-lost
             :lease (select-keys claim [:engine :version :lang_code :owner])}
            cause)))

(defn expected-abort?
  "Whether `error` represents an expected lease safety abort rather than an index implementation failure."
  [error]
  (contains? #{::lease-lost ::coordinate-obsolete} (:type (ex-data error))))

(defn throw-if-lost!
  "Abort the current leased operation if its owner has been established as stale."
  []
  (when (some-> *lease-context* :lost? deref)
    (throw (lost-ex (:claim *lease-context*)))))

(defn assert-coordinate-current!
  "Abort if the configured site locale changed after the current lease was acquired."
  []
  (when-let [{:keys [claim]} *lease-context*]
    (let [current-locale (configured-site-locale)]
      (when-not (= (:site-locale claim) current-locale)
        (record-event! claim :coordinate-obsolete)
        (throw (ex-info "Search reindex coordinate became obsolete after the site locale changed"
                        {:type ::coordinate-obsolete
                         :lease-site-locale (:site-locale claim)
                         :site-locale current-locale})))))
  true)

(defn assert-current-in-transaction!
  "Fence the caller's current mutation transaction by renewing and locking its lease row."
  [conn]
  (when-let [{:keys [claim last-renewal-start-ns] :as context} *lease-context*]
    (throw-if-lost!)
    (assert-coordinate-current!)
    ;; Only a renewal that ran and matched no row proves the lease is gone. A renewal that could not run (pool
    ;; timeout, dropped connection) fails this mutation but leaves the heartbeat to decide, as it does for its own
    ;; renewal errors.
    (let [attempt-start-ns (System/nanoTime)]
      (if (renew-on-current-connection! conn claim)
        ;; A successful fence is a renewal too; let the heartbeat's fail-safe see it so a heartbeat that cannot reach
        ;; the database does not abort a lease the fences keep proving live.
        (some-> last-renewal-start-ns (swap! max attempt-start-ns))
        (do
          (mark-lost! context)
          (throw (lost-ex claim))))))
  true)

(defn do-in-fenced-transaction!
  "Run `thunk` in a short transaction on the explicit mutation `conn`, fencing lease ownership before mutation.

  The transaction is isolated from Toucan's ambient thread-local transaction state: a streaming source query or caller
  can appear transaction-bound even though `conn` is the independent batch-write connection."
  [^Connection conn thunk]
  (when-not (.getAutoCommit conn)
    (throw (ex-info "Search lease mutation connection unexpectedly has auto-commit disabled"
                    {:type ::non-autocommit-mutation-connection})))
  (mdb/do-with-independent-connection-transaction
   conn
   (fn [conn]
     (assert-current-in-transaction! conn)
     (thunk conn))))

(defn do-with-ddl-connection
  "Run DDL `thunk` on its own fenced connection, never on a caller's ambient transaction.

  DDL commits implicitly on H2 and MySQL, which would durably commit a rollback-only test transaction the
  caller owns. Unlike row mutations, DDL on a freshly generated or unreferenced table contends with nothing
  the ambient transaction holds, so the deadlock that makes [[do-with-mutation-connection]] join the caller
  does not apply."
  [thunk]
  (t2/with-connection [conn (mdb/app-db)]
    (do-in-fenced-transaction! conn thunk)))

(defn do-with-mutation-connection
  "Run `thunk` with the connection a protected index mutation must use.

  A lease acquired outside any transaction fences each mutation in its own short transaction on a fresh
  connection. A lease acquired inside a caller's transaction keeps every mutation on that connection (as a nested
  transaction), so the caller decides when the work becomes visible or is rolled back; the database fence is
  skipped there because a renewal would otherwise hold the lease row until the caller commits. That trades
  cross-node fencing for transactional enlistment, which only test fixtures need, so [[do-with-lease]] refuses
  ambient transactions outside test mode."
  [thunk]
  (if (some-> *lease-context* :ambient-transaction?)
    (do
      (throw-if-lost!)
      (assert-coordinate-current!)
      (t2/with-connection [conn]
        (t2/with-transaction [conn conn]
          (thunk conn))))
    (t2/with-connection [conn (mdb/app-db)]
      (do-in-fenced-transaction! conn thunk))))

(defn assert-current!
  "Prove current ownership with a short lifecycle operation. Used only where no protected DB mutation follows."
  []
  (if *lease-context*
    (do-with-lifecycle-connection (fn [conn] (assert-current-in-transaction! conn)))
    true))

(defn- lease-duration-nanos []
  (.toNanos ^java.time.Duration *lease-duration*))

(defn- heartbeat-loop!
  [{:keys [claim last-renewal-start-ns] :as context} stopped]
  (loop []
    (when-not (deref stopped *heartbeat-interval-ms* false)
      (let [attempt-start-ns (System/nanoTime)
            continue?
            (try
              (if (renew! claim)
                (do
                  ;; Record the start, not the response time, so the local fail-safe never extends ownership beyond
                  ;; the database expiry established by this request.
                  (swap! last-renewal-start-ns max attempt-start-ns)
                  true)
                (do
                  (mark-lost! context)
                  (log/errorf "Search reindex lease expired or was lost for %s"
                              (select-keys claim [:engine :version :lang_code]))
                  false))
              (catch Throwable e
                (record-event! claim :heartbeat-error)
                (if (>= (- (System/nanoTime) @last-renewal-start-ns) (lease-duration-nanos))
                  (do
                    ;; Database time remains authoritative. This monotonic deadline only stops local work once we can
                    ;; no longer prove that the last successful database renewal could still be live.
                    (mark-lost! context)
                    (log/errorf "Search reindex lease could not be renewed for a full lease duration: %s"
                                (ex-message e))
                    false)
                  (do
                    (log/warnf "Failed to heartbeat search reindex lease for %s: %s"
                               (select-keys claim [:engine :version :lang_code])
                               (ex-message e))
                    true))))]
        (when continue?
          (recur))))))

(defn- wait-for-claim
  [coordinate wait?]
  (let [deadline-ns (+ (System/nanoTime) (* 1000000 (long *acquire-timeout-ms*)))]
    (loop [reported-busy? false]
      (if-let [claim (try-acquire! coordinate)]
        claim
        (do
          (when-not reported-busy?
            (record-event! (where-coordinate coordinate) :busy))
          (when (and wait? (< (System/nanoTime) deadline-ns))
            (try
              (Thread/sleep (long *acquire-retry-interval-ms*))
              (catch InterruptedException e
                (.interrupt (Thread/currentThread))
                (throw e)))
            (recur true)))))))

(defn- ambient-transactions-allowed?
  "Only test fixtures may acquire a lease inside an ambient app-db transaction; see [[do-with-mutation-connection]]."
  []
  config/is-test?)

(defn do-with-lease
  "Acquire `coordinate`, run `thunk` with a heartbeat, and release afterward.

  By default a busy caller retries without holding a connection for up to [[*acquire-timeout-ms*]], then gives up
  with `{:acquired? false}`. Pass `{:wait? false}` for a single non-blocking attempt."
  ([coordinate thunk]
   (do-with-lease coordinate thunk {}))
  ([coordinate thunk {:keys [wait?] :or {wait? true}}]
   (when (and (mdb/in-transaction?) (not (ambient-transactions-allowed?)))
     (record-event! (where-coordinate coordinate) :refused-in-transaction)
     (throw (ex-info (str "Search reindex leases cannot be acquired inside an app-db transaction."
                          " Schedule the reindex with mdb/do-after-commit, or move it outside the transaction.")
                     {:type ::ambient-transaction, :coordinate (where-coordinate coordinate)})))
   (if-let [claim (wait-for-claim coordinate wait?)]
     (let [stopped               (promise)
           heartbeat             (volatile! nil)
           last-renewal-start-ns (atom (:last-renewal-start-ns claim))
           context               {:claim                 claim
                                  :lost?                 (atom false)
                                  :last-renewal-start-ns last-renewal-start-ns
                                  :ambient-transaction?  (mdb/in-transaction?)}
           timer                 (u/start-timer)]
       (try
         (record-event! claim (if (:taken-over? claim) :taken-over :acquired))
         ;; Never convey a caller-owned connection to the heartbeat thread. Transaction depth is intentionally
         ;; conveyed: an ambient transaction means this process's isolated coordination pool must be used.
         (vreset! heartbeat (binding [t2.conn/*current-connectable* nil]
                              (future (heartbeat-loop! context stopped))))
         {:acquired? true
          :result    (binding [*lease-context* context
                               i18n/*site-locale-override* (:lang_code claim)]
                       (thunk))}
         (finally
           (deliver stopped true)
           (when-let [heartbeat @heartbeat]
             (future-cancel heartbeat))
           (try
             (release! claim)
             (catch Throwable e
               (record-event! claim :release-error)
               (log/warnf "Failed to release search reindex lease for %s; it expires within %s of its last renewal: %s"
                          (select-keys claim [:engine :version :lang_code])
                          *lease-duration*
                          (ex-message e))))
           (observe-held-duration! claim timer))))
     {:acquired? false})))
