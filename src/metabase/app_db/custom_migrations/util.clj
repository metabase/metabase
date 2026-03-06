(ns metabase.app-db.custom-migrations.util
  (:require
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.classloader.core :as classloader]
   [metabase.task.bootstrap]))

(set! *warn-on-reflection* true)

(defn- set-jdbc-backend-properties! []
  (metabase.task.bootstrap/set-jdbc-backend-properties! (mdb.connection/db-type)))

(def ^:dynamic *allow-temp-scheduling*
  "If true, the scheduler will be started temporarily for migrations that require it. If false, migrations that use `do-with-temp-schedule` will be a no-op."
  true)

(defn do-with-temp-schedule
  "This is used by migrations which modify the persistent scheduler configuration so it needs a scheduler running.
  BUT: liquibase is ran before the scheduler is officially/fully started.

  So this function temporarily starts the scheduler and runs the given function then shuts the scheduler back down.

  However, we have to be careful about running this after the scheduler has been fully started (such as running tests in a running REPL)
  because `(qs/initialize)` _doesn't_ return a new instance but will return the normal scheduler instance which will them be incorrectly shut down.

  Since we don't really need to run migrations against the scheduler in tests, this function will throw an exception if it sees an already-running scheduler.
  The various 'run this test with a temp database' functions should set `*allow-temp-scheduling*` to false so this call does nothing, so you should still never see the exception."
  [f]
  (when *allow-temp-scheduling*
    (classloader/the-classloader)
    (set-jdbc-backend-properties!)
    ;; quartz.properties sets acquireTriggersWithinLock=true to prevent duplicate trigger firing in
    ;; multi-pod clusters (GDGT-1790). However, the temp migration scheduler is single-instance and
    ;; doesn't need that lock. We must disable it here because on a fresh DB, Quartz's
    ;; StdRowLockSemaphore lazily INSERTs into QRTZ_LOCKS, and if the row already exists (e.g. from a
    ;; prior migration step), the INSERT fails. On Postgres, a failed INSERT poisons the entire
    ;; transaction, causing subsequent operations to fail with
    ;; "current transaction is aborted, commands ignored until end of transaction block".
    ;; We use a System property override because StdSchedulerFactory merges system props on top of
    ;; quartz.properties during initialize(), and we clear it immediately after so the main scheduler
    ;; later picks up the correct `true` value from quartz.properties.
    (System/setProperty "org.quartz.jobStore.acquireTriggersWithinLock" "false")
    (let [scheduler (qs/initialize)]
      (System/clearProperty "org.quartz.jobStore.acquireTriggersWithinLock")
      (when (qs/started? scheduler)
        (throw (ex-info "Scheduler is already started, cannot start temporary one" {})))

      (qs/start scheduler)
      (f scheduler)
      (qs/shutdown scheduler))))

(defmacro with-temp-schedule!
  "Execute the body with a temporary Quartz scheduler.
    (with-temp-schedule! [scheduler]
      (do-something scheduler))"
  [[scheduler-binding] & body]
  `(do-with-temp-schedule (fn [~scheduler-binding] ~@body)))
