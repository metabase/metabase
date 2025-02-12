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
  (let [scheduler (qs/initialize)]
    (qs/start scheduler)
    (f scheduler)
    (qs/shutdown scheduler)))

(defmacro with-temp-schedule!
  "Execute the body with a temporary Quartz scheduler.
    (with-temp-schedule! [scheduler]
      (do-something scheduler))"
  [[scheduler-binding] & body]
  `(do-with-temp-schedule (fn [~scheduler-binding] ~@body)))
