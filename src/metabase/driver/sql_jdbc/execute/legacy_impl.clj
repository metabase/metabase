(ns metabase.driver.sql-jdbc.execute.legacy-impl
  "Implementations of `sql-jdbc.execute` methods for JDBC drivers that aren't fully JDBC 4.2 compliant or otherwise
  don't fully support the new JSR-310 `java.time` classes. Drivers with `::use-legacy-classes-for-read-and-set` as a
  parent will use these implementations instead of the defaults."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util.date-2 :as u.date])
  (:import [java.sql PreparedStatement ResultSet Types]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [java.util Calendar TimeZone]))

;; method impls for JDBC drivers that aren't fully JDBC 4.2 compliant/don't support the new `java.time` methods
(driver/register! ::use-legacy-classes-for-read-and-set, :abstract? true)

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set LocalDate]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [t (t/sql-date t)]
    (log/tracef "(.setDate ps %d ^%s %s)" i (.getName (class t)) (pr-str t))
    (.setDate ps i t)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set LocalDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [t (t/sql-timestamp t)]
    (log/tracef "(.setTimestamp %d ^%s %s)" i (.getName (class t)) (pr-str t))
    (.setTimestamp ps i t)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set LocalTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [t (t/sql-time t)]
    (log/tracef "(.setTime %d ^%s %s)" i (.getName (class t)) (pr-str t))
    (.setTime ps i t)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set OffsetTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-time t)]
    (log/tracef "(.setTime %d ^%s %s ^Calendar %s)" i (.getName (class t)) (pr-str t) cal)
    (.setTime ps i t cal)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set OffsetDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-timestamp t)]
    (log/tracef "(.setTimestamp %d ^%s %s ^Calendar %s)" i (.getName (class t)) (pr-str t) cal)
    (.setTimestamp ps i t cal)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set ZonedDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-timestamp t)]
    (log/tracef "(.setTimestamp %d ^%s %s ^Calendar %s)" i (.getName (class t)) (pr-str t) cal)
    (.setTimestamp ps i t cal)))

(defn- results-calendar ^java.util.Calendar []
  (Calendar/getInstance (TimeZone/getTimeZone (qp.timezone/results-timezone-id))))

;; (defmethod sql-jdbc.execute/read-column [:use-legacy-classes-for-read-and-set Types/TIME]
;;   [_ _ ^ResultSet rs _ ^Integer i]
;;   (log/tracef "(.getTime rs %d <%s Calendar>)" i (qp.timezone/results-timezone-id))
;;   (t/local-time (.getTime rs i (results-calendar))))

;; (defmethod sql-jdbc.execute/read-column [::use-legacy-classes-for-read-and-set Types/DATE]
;;   [_ _ ^ResultSet rs _ ^Integer i]
;;   (log/tracef "(.getDate rs %d <%s Calendar>)" i (qp.timezone/results-timezone-id))
;;   (t/zoned-date-time
;;    (t/local-date (.getDate rs i (results-calendar)))
;;    (t/local-time 0)
;;    (t/zone-id (qp.timezone/results-timezone-id))))

;; (defmethod sql-jdbc.execute/read-column [::use-legacy-classes-for-read-and-set Types/TIMESTAMP]
;;   [_ _ ^ResultSet rs _ ^Integer i]
;;   (log/tracef "(.getTimestamp rs %d <%s Calendar>)" i (qp.timezone/results-timezone-id))
;;   (t/zoned-date-time
;;    (t/local-date-time (.getTimestamp rs i (results-calendar)))
;;    (t/zone-id (qp.timezone/results-timezone-id))))

;; (defn- utc-calendar ^java.util.Calendar []
;;   (Calendar/getInstance (TimeZone/getTimeZone "UTC")))

(defmethod sql-jdbc.execute/read-column [:use-legacy-classes-for-read-and-set Types/TIME]
  [_ _ ^ResultSet rs _ ^Integer i]
  (let [s (.getString rs i)
        t (u.date/parse s)]
    (log/tracef "(.getString rs i) [TIME] -> %s -> %s" (pr-str s) (pr-str t))
    t))

(defmethod sql-jdbc.execute/read-column [::use-legacy-classes-for-read-and-set Types/DATE]
  [_ _ ^ResultSet rs _ ^Integer i]
  (let [s (.getString rs i)
        t (u.date/parse s)]
    (log/tracef "(.getString rs i) [DATE] -> %s -> %s" (pr-str s) (pr-str t))
    t))

(defmethod sql-jdbc.execute/read-column [::use-legacy-classes-for-read-and-set Types/TIMESTAMP]
  [_ _ ^ResultSet rs _ ^Integer i]
  (let [s (.getString rs i)
        t (u.date/parse s)]
    (log/tracef "(.getString rs i) [TIMESTAMP] -> %s -> %s" (pr-str s) (pr-str t))
    t))
