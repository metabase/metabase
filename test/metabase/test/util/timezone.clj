(ns metabase.test.util.timezone
  (:require [clj-time.core :as time]
            [metabase.driver :as driver]
            [metabase.util.date :as du])
  (:import java.util.TimeZone
           org.joda.time.DateTimeZone))

(defn- ->datetimezone ^DateTimeZone [timezone]
  (cond
    (instance? DateTimeZone timezone)
    timezone

    (string? timezone)
    (DateTimeZone/forID timezone)

    (instance? TimeZone)
    (DateTimeZone/forTimeZone timezone)))

(defn call-with-jvm-tz
  "Invokes the thunk `F` with the JVM timezone set to `DTZ` (String or instance of TimeZone or DateTimeZone), puts the
  various timezone settings back the way it found it when it exits."
  [dtz f]
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
        (f))
      (finally
        ;; We need to ensure we always put the timezones back the way
        ;; we found them as it will cause test failures
        (TimeZone/setDefault orig-tz)
        (DateTimeZone/setDefault orig-dtz)
        (System/setProperty "user.timezone" orig-tz-prop)))))

(defmacro with-jvm-tz
  "Invokes `BODY` with the JVM timezone set to `DTZ`"
  [^DateTimeZone dtz & body]
  `(call-with-jvm-tz ~dtz (fn [] ~@body)))
