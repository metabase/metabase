(ns metabase.app-db.activity-test-util
  "Counts app-DB activity at the JDBC level, for cost tests. [[count-keys]] defines what it counts.

  How: for the duration of [[count-db-activity!]], the root value of `metabase.app-db.connection/*application-db*` is
  replaced by a copy whose `:data-source` hands out counting proxies of the real (pooled) connections. Each app-DB
  connection that a thread gets during the count goes through that data source, so the counts cover every library
  (toucan, raw JDBC, the query processor) and every thread that uses the root binding, including the virtual threads
  async imports/exports run on.

  Not counted: work on a connection that a thread got before the count (so [[count-db-activity!]] throws when the
  calling thread holds one, as in the body of a default `mt/with-temp`); a statement that a `ResultSet` or
  `DatabaseMetaData` hands out, or that is made on the connection that `Connection.unwrap` returns; and Quartz's
  separate data source.

  Because the swap is JVM-wide, anything else using the app DB at the same time is counted too. Tests that use
  this MUST NOT be marked `^:parallel`, and the totals include background work (scheduler, heartbeats, async
  search indexing) that happens to run during the block. Two ways to cope:
  - compare two sizes of the same scenario (see `metabase-enterprise.remote-sync.cost-test-util/per-entity`) so
    fixed and background costs cancel;
  - use `:by-thread`, the same counts keyed by the id of the thread that made each call, to assert exactly on
    threads you control (see `metabase.app-db.activity-counter-test`) or to see where unexpected activity came
    from.

  The result holds the total of each key of [[count-keys]] across threads, the same counts for each thread under
  `:by-thread {thread-id counts}`, the thunk's value under `:result`, and its wall time under `:elapsed-ms`."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.settings.core :as setting]
   [toucan2.connection :as t2.conn])
  (:import
   (java.lang.reflect InvocationHandler InvocationTargetException Method Proxy)
   (java.sql CallableStatement Connection PreparedStatement Statement)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(def count-keys
  "The count keys of a [[count-db-activity!]] result, in order. On Postgres, the round trips are about
  `:statements` + `:commits` + `:rollbacks` + `:savepoints` + `:releases` + `:checkins`, plus `:transactions` unless
  the driver sends `BEGIN` with the next statement."
  [;; statement executions: each method in `execute-methods`; a batch counts once
   :statements
   ;; `prepareStatement`, `prepareCall` and `createStatement` calls
   :prepares
   ;; connections that the data source hands out
   :checkouts
   ;; connections closed (returned to the pool). On Postgres each one also sends `DISCARD ALL`
   ;; (`metabase.app-db.connection-pool-setup`), which H2 never shows
   :checkins
   ;; `setAutoCommit false` calls: transaction starts (a Postgres `BEGIN`)
   :transactions
   ;; `setSavepoint` calls. Metabase sets one at the start of each transaction scope, the top-level one included
   ;; (`metabase.app-db.connection/do-transaction`), so a plain transaction is BEGIN + SAVEPOINT + COMMIT on Postgres
   :savepoints
   ;; `releaseSavepoint` calls (a nested scope that succeeded)
   :releases
   ;; `commit` calls
   :commits
   ;; `rollback` calls, of a whole transaction or to a savepoint; a failed transaction does both
   :rollbacks])

(def ^:private zero-counts (zipmap count-keys (repeat 0)))

(defn- bump
  "Increment `k` in the calling thread's counts. Thread-safe."
  [counts k]
  (swap! counts update-in [(.threadId (Thread/currentThread)) k] (fnil inc 0)))

(defn- invoke
  "Invoke `method` on `target`, rethrowing the real exception rather than the reflection wrapper, so callers that
  classify SQL errors (e.g. transient-error retries) see what they would without the proxy."
  [target ^Method method args]
  (try
    (.invoke method target ^objects args)
    (catch InvocationTargetException e
      (throw (.getCause e)))))

(defn- proxy-of
  "A java.lang.reflect.Proxy of `target` implementing `iface`, calling `(on-call method-name args)` before each
  call and returning `(wrap-result method-name result proxy)`."
  [^Class iface target on-call wrap-result]
  (Proxy/newProxyInstance
   (.getClassLoader iface)
   (into-array Class [iface])
   (reify InvocationHandler
     (invoke [_ proxy method args]
       (let [n (.getName ^Method method)]
         (on-call n args)
         (wrap-result n (invoke target method args) proxy))))))

(def ^:private execute-methods
  #{"execute" "executeQuery" "executeUpdate" "executeLargeUpdate" "executeBatch" "executeLargeBatch"})

(defn- counting-statement
  "A counting proxy of `stmt`, made on the counting connection `conn`. Its `getConnection` returns `conn`, not the
  real connection, so that statements made on that connection count too."
  [counts ^Class iface stmt conn]
  (proxy-of iface stmt
            (fn [n _] (when (execute-methods n) (bump counts :statements)))
            (fn [n result _] (if (= "getConnection" n) conn result))))

(defn- counting-connection [counts ^Connection conn]
  (proxy-of Connection conn
            (fn [n args]
              (case n
                "setAutoCommit"    (when (false? (aget ^objects args 0)) (bump counts :transactions))
                "setSavepoint"     (bump counts :savepoints)
                "releaseSavepoint" (bump counts :releases)
                "commit"           (bump counts :commits)
                "rollback"         (bump counts :rollbacks)
                "close"            (bump counts :checkins)
                ("prepareStatement" "prepareCall" "createStatement") (bump counts :prepares)
                nil))
            (fn [n result conn]
              (case n
                "prepareStatement" (counting-statement counts PreparedStatement result conn)
                "prepareCall"      (counting-statement counts CallableStatement result conn)
                "createStatement"  (counting-statement counts Statement result conn)
                result))))

(defn- counting-data-source ^DataSource [counts ^DataSource ds]
  (reify DataSource
    (getConnection [_]
      (bump counts :checkouts)
      (counting-connection counts (.getConnection ds)))
    (getConnection [_ user password]
      (bump counts :checkouts)
      (counting-connection counts (.getConnection ds user password)))
    (getLogWriter [_] (.getLogWriter ds))
    (setLogWriter [_ w] (.setLogWriter ds w))
    (setLoginTimeout [_ s] (.setLoginTimeout ds s))
    (getLoginTimeout [_] (.getLoginTimeout ds))
    (getParentLogger [_] (.getParentLogger ds))
    (unwrap [_ iface] (.unwrap ds iface))
    (isWrapperFor [_ iface] (.isWrapperFor ds iface))))

(defn- counting-app-db
  "A copy of the ApplicationDB `app-db` whose data source counts into `counts`."
  [counts app-db]
  (assoc app-db :data-source (counting-data-source counts (:data-source app-db))))

(defonce ^:private ^{:doc "Whether a count runs now. The count replaces the JVM-wide root application DB, so two
  counts at the same time would restore each other's counting copy."}
  counting?
  (atom false))

(defn count-db-activity!
  "Run `thunk` with app-DB activity counted JVM-wide (see the ns docstring). Returns the counts map with the
  thunk's return value under `:result` and its wall time under `:elapsed-ms`. Not for `^:parallel` tests. Throws,
  having sent nothing, when the calling thread holds an app-DB connection already, or when another count runs.

  Just before the count, and not counted, forces the settings-cache check (`setting/restore-cache-if-needed!`), so a
  setting read in `thunk` sends no check while the check's throttle holds. Limits:
  - a count whose `:elapsed-ms` exceeds `setting/cache-update-check-interval-ms`, or a `thunk` that resets the
    throttle, can contain one check;
  - the forced check can reload the settings cache, and so run `:on-change` hooks (which can write rows) just before
    `thunk`, uncounted.

  If the calling thread has bound `*application-db*` (for example inside `mt/with-empty-h2-app-db!`), that bound
  value is counted too, for the calling thread and for threads that convey its bindings. Then the totals can add two
  different databases (the bound one and the root one); assert exactly on `:by-thread`. A binding that `thunk`
  itself makes is not counted. A conveyed thread that runs after this returns still uses the counting copy, and its
  activity is not reported."
  [thunk]
  (when (instance? Connection t2.conn/*current-connectable*)
    (throw (ex-info (str "The calling thread already holds an app-DB connection (for example inside a default "
                         "mt/with-temp), and the counter cannot see work on it. Use rs.test/commit-with-temp, or "
                         "start the count outside the transaction.")
                    {:connection t2.conn/*current-connectable*})))
  (when-not (compare-and-set! counting? false true)
    (throw (ex-info "Another app-DB count runs now; counts cannot overlap" {})))
  (let [app-db-var #'mdb.connection/*application-db*
        counts     (atom {})
        original   (.getRawRoot app-db-var)]
    (try
      ;; inside the `try`, so that a check that throws still resets `counting?`
      (setting/restore-cache-if-needed! :force-check? true)
      (let [start-ns  (System/nanoTime)
            _         (alter-var-root app-db-var (constantly (counting-app-db counts original)))
            result    (if (thread-bound? app-db-var)
                        (with-bindings {app-db-var (counting-app-db counts mdb.connection/*application-db*)}
                          (thunk))
                        (thunk))
            elapsed   (quot (- (System/nanoTime) start-ns) 1000000)
            by-thread (update-vals @counts #(merge zero-counts %))]
        (assoc (apply merge-with + zero-counts (vals by-thread))
               :by-thread  by-thread
               :result     result
               :elapsed-ms elapsed))
      (finally
        (alter-var-root app-db-var (constantly original))
        (reset! counting? false)))))

(defmacro with-db-activity!
  "Run `body` with app-DB activity counted; returns the counts map with body's value under `:result`.

    (let [{:keys [statements checkins savepoints]} (with-db-activity! (do-the-thing!))]
      (is (<= statements 100)))"
  [& body]
  `(count-db-activity! (fn [] ~@body)))
