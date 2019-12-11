(ns metabase.test.util.timezone
  (:require [clojure.test :as t]
            [metabase.driver :as driver]
            [metabase.test.initialize :as initialize])
  (:import java.util.TimeZone))

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
  "Execute `body` with the system time zone temporarily changed to the time zone named by `timezone-id`.

  TODO — consider deprecating this as well. You can do something like

    (t/with-clock (t/mock-clock (t/instant (t/zoned-date-time
                                            (t/local-date \"2019-11-18\")
                                            (t/local-time 0)
                                            (t/zone-id \"US/Pacific\")))
                                (t/zone-id \"US/Pacific\"))
      ...)

  almost everywhere you'd use this."
  [timezone-id & body]
  `(do-with-system-timezone-id ~timezone-id (fn [] ~@body)))
