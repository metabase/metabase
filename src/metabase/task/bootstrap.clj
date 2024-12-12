(ns metabase.task.bootstrap
  (:require
   [metabase.plugins.classloader :as classloader]))

(set! *warn-on-reflection* true)

;; Custom `ConnectionProvider` implementation that uses our application DB connection pool to provide connections.

(defn- app-db ^javax.sql.DataSource []
  ((requiring-resolve 'metabase.db/app-db)))

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
    ;;
    ;; in a perfect world we could just check whether we're creating a new Connection or not, and if using an existing
    ;; Connection, wrap it in a delegating proxy wrapper that makes `.close()` a no-op but forwards all other methods.
    ;; Now that would be a useful macro!
    (.getConnection (app-db)))
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

(defn set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)"
  [db-type]
  (when (= db-type :postgres)
    (System/setProperty "org.quartz.jobStore.driverDelegateClass" "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate")))
