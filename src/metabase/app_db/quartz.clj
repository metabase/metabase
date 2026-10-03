(ns metabase.app-db.quartz
  "Quartz JDBC plumbing over the application DB: a `ConnectionProvider` backed by our connection pool,
  a `ClassLoadHelper` that uses our classloader, and the JDBC backend system properties."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.classloader.core :as classloader]
   [metabase.task.secure-delegate.core :as secure-delegate]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; Optional interceptor for wrapping JDBC connections before Quartz uses them.
;; Set by tracing.quartz to add SQL-level tracing. nil means no interception.
(defonce ^:private connection-interceptor (atom nil))

(defn set-connection-interceptor!
  "Set an optional function to wrap JDBC connections before Quartz uses them.
   Called by tracing.quartz to add SQL-level tracing. Pass nil to remove."
  [f]
  (reset! connection-interceptor f))

;; Custom `ConnectionProvider` implementation that uses a dedicated connection pool for the application DB to provide
;; connections.
(defrecord ^:private ConnectionProvider []
  org.quartz.utils.ConnectionProvider
  (initialize [_])
  (getConnection [_]
    ;; get a connection from the dedicated Quartz connection pool. Quartz will close it (i.e., return it to the pool)
    ;; when it's done.
    ;;
    ;; very important! Fetch a new connection from the connection pool rather than reusing a Connection already bound
    ;; to the calling thread (e.g. toucan2's *current-connectable*) -- Quartz manages the connection's whole
    ;; lifecycle (setAutoCommit/commit/rollback/close), and its cluster locking relies on commit/rollback to release
    ;; row locks on the QRTZ_LOCKS table, so it must never share a connection with an outer transaction.
    ;;
    ;; the pool is separate from the main application DB pool so that a Quartz operation triggered by a thread inside
    ;; a `with-transaction` block can't deadlock when application code has saturated the main pool.
    (let [conn (.getConnection (mdb.connection/quartz-data-source))]
      (if-let [interceptor @connection-interceptor]
        (interceptor conn)
        conn)))
  (shutdown [_]))

(when-not *compile-files*
  (System/setProperty "org.quartz.dataSource.db.connectionProvider.class" (.getName ConnectionProvider)))

;; Quartz stores each job's class name in the app DB, and moving a job's namespace renames its class. Without a
;; registered rename, the first upgraded node deletes the stored job as classless at startup, even while an old node
;; is running it, and reschedules it under the new name, which old nodes can't load. With one, stored rows keep the
;; old name, which old nodes load, and upgraded nodes load the current class under it.
(defonce ^:private renamed-job-classes
  ;; old class name -> current class name. Registrations stay for good: stored rows keep the old name.
  (atom {}))

(defn- add-renamed-job-class
  "Returns `renames`, a map of old job class names to current ones, with `old-name` mapped to `current-name`.
  Throws when the names are equal, when `old-name` already maps to another class, or when either name is already
  registered on the other side."
  [renames old-name current-name]
  (cond
    (= old-name current-name)
    (throw (ex-info (format "Job class %s can't be registered as its own old name" old-name)
                    {:old-name old-name}))

    (not= current-name (get renames old-name current-name))
    (throw (ex-info (format "Job class name %s is already registered as an old name of %s"
                            old-name (get renames old-name))
                    {:old-name old-name, :current-name current-name}))

    (contains? renames current-name)
    (throw (ex-info (format "Job class name %s is registered as an old name, so no class can have it now"
                            current-name)
                    {:old-name old-name, :current-name current-name}))

    (some #{old-name} (vals renames))
    (throw (ex-info (format "Job class name %s belongs to a current class, so it can't be an old name" old-name)
                    {:old-name old-name, :current-name current-name}))

    :else
    (assoc renames old-name current-name)))

(defn- class-exists? [^String class-name]
  (try
    (some? (Class/forName class-name false (classloader/the-classloader)))
    (catch ClassNotFoundException _
      false)))

(defn register-renamed-job-class!
  "Makes Quartz load `job-class` for jobs stored under `old-name`, the name the class had before its namespace moved.
  Call it at the top level of the job's namespace, which loads before the scheduler starts.
  Throws when `old-name` still names a class, or when it conflicts with another registered rename."
  [^String old-name ^Class job-class]
  (when (class-exists? old-name)
    (throw (ex-info (format "Job class name %s still names a class, so jobs stored under it already load" old-name)
                    {:old-name old-name, :current-name (.getName job-class)})))
  (swap! renamed-job-classes add-renamed-job-class old-name (.getName job-class))
  nil)

(defn- load-class ^Class [^String class-name]
  (Class/forName (get @renamed-job-classes class-name class-name) true (classloader/the-classloader)))

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
  ;; Fns of the db-type that [[set-jdbc-backend-properties!]] runs right before the scheduler initializes.
  ;; They let a module that depends on `app-db`, such as `mq`, install its own Quartz `DriverDelegate`.
  (atom []))

(defn register-jdbc-property-setter!
  "Register `f`, a fn of the app-db `db-type`, to run when Quartz's JDBC backend properties are set.
  Setters run in registration order, just before the scheduler initializes."
  [f]
  (swap! jdbc-property-setters conj f))

(defn set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)

  Installs Metabase's per-DB `DriverDelegate` (see [[metabase.task.secure-delegate.core]]): a
  `StdJDBCDelegate`/`PostgreSQLDelegate` subclass that reads BLOB columns through a class allow-list, so
  Quartz reconstructs only the plain-data classes Metabase's job data is made of. Then runs any setters
  registered via [[register-jdbc-property-setter!]]. A registered setter that throws is logged and
  skipped so the scheduler still gets a working delegate."
  [db-type]
  (secure-delegate/install! db-type)
  (doseq [setter @jdbc-property-setters]
    (try
      (setter db-type)
      (catch Throwable t
        (log/warnf "A registered Quartz JDBC property setter failed; continuing: %s" (ex-message t))))))
