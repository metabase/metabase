(ns metabase.task.bootstrap
  (:require
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn])
  (:import
   (java.lang.reflect InvocationHandler InvocationTargetException Method Proxy)
   (java.sql Connection)))

(set! *warn-on-reflection* true)

;; Custom `ConnectionProvider` implementation that uses our application DB connection pool to provide connections.

(defn- app-db ^javax.sql.DataSource []
  ((requiring-resolve 'metabase.app-db.core/app-db)))

;; Optional interceptor for wrapping JDBC connections before Quartz uses them.
;; Set by task.tracing to add SQL-level tracing. nil means no interception.
(defonce ^:private connection-interceptor (atom nil))

(defn set-connection-interceptor!
  "Set an optional function to wrap JDBC connections before Quartz uses them.
   Called by task.tracing to add SQL-level tracing. Pass nil to remove."
  [f]
  (reset! connection-interceptor f))

(defn- invoke-or-unwrap
  "Invoke a method on a target, unwrapping InvocationTargetException to preserve the original exception type."
  [^Method method target ^objects args]
  (try
    (if args
      (.invoke method target args)
      (.invoke method target (object-array 0)))
    (catch InvocationTargetException e
      (throw (or (.getCause e) e)))))

(def ^:private ^:const suppressed-methods
  "Methods suppressed on the non-closeable connection proxy. These prevent Quartz from interfering with the outer
  transaction's lifecycle when reusing an existing connection."
  #{"close" "commit" "rollback" "setAutoCommit"})

(defn- non-closeable-connection
  "Wrap a Connection in a proxy that suppresses close/commit/rollback/setAutoCommit. Used when reusing the current
  thread's Toucan2-managed connection for Quartz operations to prevent deadlocks."
  ^Connection [^Connection conn]
  (Proxy/newProxyInstance
   (.getClassLoader Connection)
   (into-array Class [Connection])
   (reify InvocationHandler
     (invoke [_ _ method args]
       (when-not (suppressed-methods (.getName ^Method method))
         (invoke-or-unwrap method conn args))))))

(defrecord ^:private ConnectionProvider []
  org.quartz.utils.ConnectionProvider
  (initialize [_])
  (getConnection [_]
    ;; If there's already a Connection bound to the current thread (via toucan2's *current-connectable*), reuse it
    ;; through a non-closeable proxy. This prevents deadlocks when Quartz operations are triggered inside
    ;; with-transaction or with-connection blocks -- without the proxy, Quartz would try to check out a new connection
    ;; from the pool, which can deadlock if the pool is saturated.
    ;; The proxy suppresses close/commit/rollback/setAutoCommit so Quartz can't interfere with the outer transaction.
    (let [current t2.conn/*current-connectable*
          conn    (if (instance? Connection current)
                    (non-closeable-connection current)
                    (.getConnection (app-db)))]
      (if-let [interceptor @connection-interceptor]
        (interceptor conn)
        conn)))
  (shutdown [_]))

(when-not *compile-files*
  (System/setProperty "org.quartz.dataSource.db.connectionProvider.class" (.getName ConnectionProvider)))

(defn- load-class ^Class [^String class-name]
  (Class/forName class-name true (classloader/the-classloader)))

(defrecord ^:private ClassLoadHelper []
  org.quartz.spi.ClassLoadHelper
  (initialize [_])
  (getClassLoader [_]
    (classloader/the-classloader))
  (loadClass [_ class-name]
    (load-class class-name))
  (loadClass [_ class-name _]
    (load-class class-name)))

(when-not *compile-files*
  (System/setProperty "org.quartz.scheduler.classLoadHelper.class" (.getName ClassLoadHelper)))

(defonce ^:private jdbc-property-setters
  ;; Extra fns (of db-type) run by set-jdbc-backend-properties! right before the scheduler initializes.
  ;; Lets a higher-level module (e.g. `mq`, which installs its node-affinity Quartz DriverDelegate)
  ;; hook in without `task` depending on it — `task` cannot depend on the modules that depend on it.
  (atom []))

(defn register-jdbc-property-setter!
  "Register `f` (a fn of the app-db `db-type`) to run when Quartz's JDBC backend properties are set,
  just before the scheduler initializes. Used by the `mq` module to install its node-affinity
  `DriverDelegate` — registering here inverts the dependency so `task` never references `mq`."
  [f]
  (swap! jdbc-property-setters conj f))

(defn set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)

  Sets the default per-DB `DriverDelegate` (`PostgreSQLDelegate` on Postgres for BLOB handling,
  otherwise the `StdJDBCDelegate` from `quartz.properties`), then runs any setters registered via
  [[register-jdbc-property-setter!]] — e.g. the `mq` module's queue node-affinity delegate, which
  overrides the delegate with a filtering subclass. A registered setter that throws is logged and
  skipped so the scheduler still gets a working delegate."
  [db-type]
  (when (= db-type :postgres)
    (System/setProperty "org.quartz.jobStore.driverDelegateClass" "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate"))
  (doseq [setter @jdbc-property-setters]
    (try
      (setter db-type)
      (catch Throwable t
        (log/warnf "A registered Quartz JDBC property setter failed; continuing: %s" (ex-message t))))))
