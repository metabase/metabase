(ns metabase.task.scheduler
  "Stuff for bootstrapping the Quartz scheduler, including system property manipulation stuff. This is also used by
  custom migrations, so don't touch anything here, or add any new dependencies!"
  (:require
   [clojure.java.io :as io]
   [com.rpl.proxy-plus :as proxy-plus]
   [metabase.db.connection :as mdb.connection]
   [metabase.plugins.classloader :as classloader]
   [toucan2.connection :as t2.connection])
  (:import
   (org.quartz.core QuartzSchedulerResources QuartzScheduler)
   (org.quartz.impl StdScheduler StdSchedulerFactory)
   (org.quartz.impl.jdbcjobstore JobStoreSupport JobStoreTX)
   (org.quartz.spi JobStore)))

(set! *warn-on-reflection* true)

;; Custom `ConnectionProvider` implementation that uses our application DB connection pool to provide connections.

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
    (println "mdb.connection/*application-db*:" mdb.connection/*application-db*) ; NOCOMMIT
    (.getConnection mdb.connection/*application-db*))
  (shutdown [_]))

(def ^:private current-connection-job-store-3
  (proxy [JobStoreTX] []))

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

(defn- quartz-properties ^java.util.Properties []
  (with-open [r (java.io.FileReader. (io/file (io/resource "quartz.properties")))]
    (doto (java.util.Properties.)
      (.load r)
      (.putAll {"org.quartz.scheduler.instanceName"                 (str (gensym "MetabaseScheduler__"))
                "org.quartz.dataSource.db.connectionProvider.class" (.getName ConnectionProvider)
                "org.quartz.scheduler.classLoadHelper.class"        (.getName ClassLoadHelper)
                "org.quartz.jobStore.driverDelegateClass"           (if (= (mdb.connection/db-type) :postgres)
                                                                      "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate"
                                                                      "org.quartz.impl.jdbcjobstore.StdJDBCDelegate")}))))

(defn new-quartz-scheduler
  "Create a *new* Quartz scheduler. This creates a new instance every time! You probably don't want to do this, you
  probably want to use the existing global one in [[metabase.task/*quartz-scheduler*]] instead!"
   ^StdScheduler []
  (.getScheduler (StdSchedulerFactory. (quartz-properties))))

(defn- scheduler-resources ^QuartzSchedulerResources [^StdScheduler scheduler]
  (let [^QuartzScheduler quartz-scheduler (.get (doto (.getDeclaredField StdScheduler "sched")
                                                  (.setAccessible true))
                                                scheduler)]
    (.get (doto (.getDeclaredField QuartzScheduler "resources")
            (.setAccessible true))
          quartz-scheduler)))

(defn new-quartz-scheduler-for-open-connection []
  #_(assert (instance? java.sql.Connection t2.connection/*current-connectable*))
  (let [scheduler (.getScheduler
                   (StdSchedulerFactory.
                    (doto (quartz-properties)
                      (.putAll {"org.quartz.scheduler.instanceName" (str (gensym "MetabaseSchedulerForCurrentConnection__"))
                                "org.quartz.jobStore.class"         (.getName (class current-connection-job-store-3))}))))
        resources (scheduler-resources scheduler)
        job-store (.getJobStore resources)]
    (.setJobStore resources (-> job-store
                                (init-proxy (let [conn toucan2.connection/*current-connectable*]
                                              (println "conn:" conn) ; NOCOMMIT
                                              (assert (instance? java.sql.Connection conn))
                                              {"getNonManagedTXConnection" (constantly conn)
                                               "getConnection"             (constantly conn)
                                               "closeConnection"           (fn [_this _conn]
                                                                             (.commit ^java.sql.Connection conn)
                                                                             (println "CLOSE CONN")
                                                                             nil
                                                                             )}))))
    scheduler))

(comment
  (defn x []
    ((requiring-resolve 'metabase.db.custom-migrations-test/delete-abandonment-email-task-test))))
