(ns metabase.db.custom-migrations.util
  (:require
   [clojurewerkz.quartzite.scheduler :as qs]
   [metabase.db.connection :as mdb.connection]
   [metabase.plugins.classloader :as classloader]
   [metabase.task.bootstrap]))

(defn- set-jdbc-backend-properties! []
  (metabase.task.bootstrap/set-jdbc-backend-properties! (mdb.connection/db-type)))

(defn do-with-temp-schedule
  "Internal implementation of with-temp-schedule!"
  [f]
  (classloader/the-classloader)
  (set-jdbc-backend-properties!)
  (let [scheduler (qs/initialize)
        is-active? #p (or (qs/standby? scheduler)
                          (qs/started? scheduler))]
    ;; the scheduler returned by `qs/initialize` is the defaultScheduler object configured
    ;; by our `quartz.properties` file. We don't want to start and stop this object if it
    ;; is already running when this impl runs. Since whatever process started it outside
    ;; of here probably expects it to still be running or in standby.
    ;;
    ;; TODO: Should this use an alternate InMemory implementation like the version
    ;; in `metabase.test`? Or does this even need to be started?
    (when-not is-active?
      (qs/start scheduler))
    (f scheduler)
    (when-not is-active?
      (qs/shutdown scheduler))))

(defmacro with-temp-schedule!
  "Execute the body with a temporary Quartz scheduler.
    (with-temp-schedule! [scheduler]
      (do-something scheduler))"
  [[scheduler-binding] & body]
  `(do-with-temp-schedule (fn [~scheduler-binding] ~@body)))
