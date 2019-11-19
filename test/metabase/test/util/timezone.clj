(ns metabase.test.util.timezone
  (:require [clj-time.core :as time]
            [clojure.test :as t]
            [metabase.driver :as driver]
            [metabase.test.initialize :as initialize]
            [metabase.util.date :as du])
  (:import java.util.TimeZone
           org.joda.time.DateTimeZone))

(defn- ^:deprecated ->datetimezone ^DateTimeZone [timezone]
  (cond
    (instance? DateTimeZone timezone)
    timezone

    (string? timezone)
    (DateTimeZone/forID timezone)

    (instance? TimeZone timezone)
    (DateTimeZone/forTimeZone timezone)))

(defn ^:deprecated call-with-jvm-tz
  "Invokes the thunk `F` with the JVM timezone set to `DTZ` (String or instance of TimeZone or DateTimeZone), puts the
  various timezone settings back the way it found it when it exits."
  [dtz thunk]
  (initialize/initialize-if-needed! :db :plugins)
  (let [dtz          (->datetimezone dtz)
        orig-tz      (TimeZone/getDefault)
        orig-dtz     (time/default-time-zone)
        orig-tz-prop (System/getProperty "user.timezone")]
    (try
      ;; It looks like some DB drivers cache the timezone information when instantiated, this clears those to force
      ;; them to reread that timezone value
      (#'driver/notify-all-databases-updated)
      ;; Used by JDBC, and most JVM things
      (TimeZone/setDefault (.toTimeZone dtz))
      ;; Needed as Joda time has a different default TZ
      (DateTimeZone/setDefault dtz)
      ;; We read the system property directly when formatting results, so this needs to be changed
      (System/setProperty "user.timezone" (.getID dtz))
      (with-redefs [du/jvm-timezone (delay (.toTimeZone dtz))]
        (t/testing (format "JVM timezone set to %s" (.getID dtz))
          (thunk)))
      (finally
        ;; We need to ensure we always put the timezones back the way
        ;; we found them as it will cause test failures
        (TimeZone/setDefault orig-tz)
        (DateTimeZone/setDefault orig-dtz)
        (System/setProperty "user.timezone" orig-tz-prop)))))

(defmacro ^:deprecated with-jvm-tz
  "Invokes `body` with the JVM timezone set to `dtz`. DEPRECATED because this uses Joda-Time. Use
  `with-system-timezone-id` instead!"
  [^DateTimeZone dtz & body]
  `(call-with-jvm-tz ~dtz (fn [] ~@body)))

(defn do-with-system-timezone-id [^String timezone-id thunk]
  ;; only if the app DB is already set up, we need to make sure plugins are loaded and kill any connection pools that
  ;; might exist
  (when (initialize/initialized? :db)
    (initialize/initialize-if-needed! :plugins)
    (#'driver/notify-all-databases-updated))
  (let [original-time-zone       (TimeZone/getDefault)
        original-system-property (System/getProperty "user.timezone")]
    (try
      (TimeZone/setDefault (TimeZone/getTimeZone timezone-id))
      (System/setProperty "user.timezone" timezone-id)
      (t/testing (format "JVM timezone set to %s" timezone-id)
        (thunk))
      (finally
        (TimeZone/setDefault original-time-zone)
        (System/setProperty "user.timezone" original-system-property)))))

(defmacro with-system-timezone-id
  "Execute `body` with the system time zone temporarily changed to the time zone named by `timezone-id`."
  [timezone-id & body]
  `(do-with-system-timezone-id ~timezone-id (fn [] ~@body)))
