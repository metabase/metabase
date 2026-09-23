(ns metabase-enterprise.remote-sync.db-activity
  "Counts app-DB activity at the JDBC level, for cost tests: statements, prepares, connection check-outs and
  check-ins, transaction starts, savepoints, commits and rollbacks.

  How: for the duration of [[count-db-activity]], the root value of `metabase.app-db.connection/*application-db*` is
  replaced by a copy whose `:data-source` hands out counting proxies of the real (pooled) connections. Every
  app-DB connection goes through that data source, so the counts cover every library (toucan, raw JDBC, the
  query processor) and every thread that uses the root binding, including the virtual threads async
  imports/exports run on. Quartz's separate data source is not counted.

  Because the swap is JVM-wide, anything else using the app DB at the same time is counted too. Tests that use
  this MUST NOT be marked `^:parallel`, and the totals include background work (scheduler, heartbeats, async
  search indexing) that happens to run during the block. Two ways to cope:
  - compare two sizes of the same scenario (see [[metabase-enterprise.remote-sync.pull-cost-test]]) so fixed and
    background costs cancel;
  - use `:by-thread`, the same counts keyed by the id of the thread that made each call, to assert exactly on
    threads you control (see `db-activity-test`) or to see where unexpected activity came from.

  Keys in the result (all totals across threads, plus `:by-thread {thread-id counts}` and `:result`):
  - :statements    Statement executions (`execute`, `executeQuery`, `executeUpdate`, `executeLargeUpdate`,
                   `executeBatch`; a batch counts once)
  - :prepares      `prepareStatement` / `prepareCall` / `createStatement` calls
  - :checkouts     connections obtained from the pool
  - :checkins      connections closed (returned to the pool). On Postgres each one also sends `DISCARD ALL`
                   (`metabase.app-db.connection-pool-setup`), which H2 never shows
  - :transactions  `setAutoCommit false` calls, i.e. transaction starts (a Postgres `BEGIN`)
  - :savepoints    `setSavepoint` calls. Metabase sets one at the start of EVERY transaction scope, top-level
                   included (`metabase.app-db.connection/do-transaction`), so a plain transaction is
                   BEGIN + SAVEPOINT + COMMIT on Postgres
  - :releases      `releaseSavepoint` calls (a nested scope that succeeded)
  - :commits       `commit` calls
  - :rollbacks     `rollback` calls, whole transaction or to a savepoint; a failed transaction does both

  On Postgres, round trips ≈ :statements + :commits + :rollbacks + :savepoints + :releases + :checkins
  (+ :transactions, unless the driver bundles `BEGIN` with the next statement)."
  (:import
   (java.lang.reflect InvocationHandler InvocationTargetException Method Proxy)
   (java.sql CallableStatement Connection PreparedStatement Statement)
   (javax.sql DataSource)))

(set! *warn-on-reflection* true)

(def ^:private count-keys
  [:statements :prepares :checkouts :checkins :transactions :savepoints :releases :commits :rollbacks])

(defn- bump!
  "Increment `k` in the totals and in the calling thread's own counts."
  [counts k]
  (let [tid (.threadId (Thread/currentThread))]
    (swap! counts (fn [c]
                    (-> c
                        (update-in [:totals k] inc)
                        (update-in [:by-thread tid k] (fnil inc 0)))))))

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
  call and returning `(wrap-result method-name result)`."
  [^Class iface target on-call wrap-result]
  (Proxy/newProxyInstance
   (.getClassLoader iface)
   (into-array Class [iface])
   (reify InvocationHandler
     (invoke [_ _proxy method args]
       (let [n (.getName ^Method method)]
         (on-call n args)
         (wrap-result n (invoke target method args)))))))

(def ^:private execute-methods
  #{"execute" "executeQuery" "executeUpdate" "executeLargeUpdate" "executeBatch" "executeLargeBatch"})

(defn- counting-statement [counts ^Class iface stmt]
  (proxy-of iface stmt
            (fn [n _] (when (execute-methods n) (bump! counts :statements)))
            (fn [_ result] result)))

(defn- counting-connection [counts ^Connection conn]
  (proxy-of Connection conn
            (fn [n args]
              (case n
                "setAutoCommit"    (when (false? (aget ^objects args 0)) (bump! counts :transactions))
                "setSavepoint"     (bump! counts :savepoints)
                "releaseSavepoint" (bump! counts :releases)
                "commit"           (bump! counts :commits)
                "rollback"         (bump! counts :rollbacks)
                "close"            (bump! counts :checkins)
                ("prepareStatement" "prepareCall" "createStatement") (bump! counts :prepares)
                nil))
            (fn [n result]
              (case n
                "prepareStatement" (counting-statement counts PreparedStatement result)
                "prepareCall"      (counting-statement counts CallableStatement result)
                "createStatement"  (counting-statement counts Statement result)
                result))))

(defn- counting-data-source ^DataSource [counts ^DataSource ds]
  (reify DataSource
    (getConnection [_]
      (bump! counts :checkouts)
      (counting-connection counts (.getConnection ds)))
    (getConnection [_ user password]
      (bump! counts :checkouts)
      (counting-connection counts (.getConnection ds user password)))
    (getLogWriter [_] (.getLogWriter ds))
    (setLogWriter [_ w] (.setLogWriter ds w))
    (setLoginTimeout [_ s] (.setLoginTimeout ds s))
    (getLoginTimeout [_] (.getLoginTimeout ds))
    (getParentLogger [_] (.getParentLogger ds))
    (unwrap [_ iface] (.unwrap ds iface))
    (isWrapperFor [_ iface] (.isWrapperFor ds iface))))

(defn- application-db-var
  "The var holding the current application DB, resolved at runtime (it isn't part of the app-db module's API)."
  ^clojure.lang.Var []
  ;; Test-only instrumentation: counting every app-DB connection JVM-wide means swapping the connection var's root,
  ;; which the app-db module deliberately keeps out of its API. Resolved at runtime so no production code path
  ;; depends on it.
  #_{:clj-kondo/ignore [:metabase/modules]}
  (requiring-resolve 'metabase.app-db.connection/*application-db*))

(defn count-db-activity
  "Run `thunk` with app-DB activity counted JVM-wide (see the ns docstring). Returns the counts map with the
  thunk's return value under `:result`. Not reentrant; not for `^:parallel` tests."
  [thunk]
  (let [counts   (atom {:totals (zipmap count-keys (repeat 0)) :by-thread {}})
        app-db   (application-db-var)
        original (.getRawRoot app-db)]
    (alter-var-root app-db
                    (constantly (assoc original :data-source (counting-data-source counts (:data-source original)))))
    (try
      (let [result (thunk)
            {:keys [totals by-thread]} @counts]
        (assoc totals
               :by-thread (update-vals by-thread #(merge (zipmap count-keys (repeat 0)) %))
               :result    result))
      (finally
        (alter-var-root app-db (constantly original))))))

(defmacro with-db-activity
  "Run `body` with app-DB activity counted; returns the counts map with body's value under `:result`.

    (let [{:keys [statements checkins savepoints]} (with-db-activity (do-the-thing!))]
      (is (<= statements 100)))"
  [& body]
  `(count-db-activity (fn [] ~@body)))
