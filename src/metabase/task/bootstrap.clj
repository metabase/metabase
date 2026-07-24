(ns metabase.task.bootstrap
  (:require
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log]))

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

(defrecord ^:private ConnectionProvider []
  org.quartz.utils.ConnectionProvider
  (initialize [_])
  (getConnection [_]
    ;; get a connection from our application DB connection pool. Quartz will close it (i.e., return it to the pool)
    ;; when it's done
    ;;
    ;; very important! Fetch a new connection from the connection pool rather than using currently bound Connection if
    ;; one already exists -- because Quartz will close this connection when done, we don't want to screw up the
    ;; calling block
    (let [conn (.getConnection (app-db))]
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
        (log/warn t "A registered Quartz JDBC property setter failed; continuing")))))
