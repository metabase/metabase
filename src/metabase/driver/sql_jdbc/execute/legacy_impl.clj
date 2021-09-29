(ns metabase.driver.sql-jdbc.execute.legacy-impl
  "Implementations of `sql-jdbc.execute` methods for JDBC drivers that aren't fully JDBC 4.2 compliant or otherwise
  don't fully support the new JSR-310 `java.time` classes. Drivers with `::use-legacy-classes-for-read-and-set` as a
  parent will use these implementations instead of the defaults."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.util.date-2 :as u.date])
  (:import [java.sql PreparedStatement ResultSet Types]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           [java.util Calendar TimeZone]))

;; TODO - need to do a legacy implementation using the new methods as well...

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
    (log/tracef "(.setTime %d ^%s %s <%s Calendar>)" i (.getName (class t)) (pr-str t) (.. cal getTimeZone getID))
    (.setTime ps i t cal)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set OffsetDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-timestamp t)]
    (log/tracef "(.setTimestamp %d ^%s %s <%s Calendar>)" i (.getName (class t)) (pr-str t) (.. cal getTimeZone getID))
    (.setTimestamp ps i t cal)))

(defmethod sql-jdbc.execute/set-parameter [::use-legacy-classes-for-read-and-set ZonedDateTime]
  [_ ^PreparedStatement ps ^Integer i t]
  (let [cal (Calendar/getInstance (TimeZone/getTimeZone (t/zone-id t)))
        t   (t/sql-timestamp t)]
    (log/tracef "(.setTimestamp %d ^%s %s <%s Calendar>)" i (.getName (class t)) (pr-str t) (.. cal getTimeZone getID))
    (.setTimestamp ps i t cal)))

(defmethod sql-jdbc.execute/read-column-thunk [::use-legacy-classes-for-read-and-set Types/TIME]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs i) [TIME] -> %s -> %s" (pr-str s) (pr-str t))
        t))))

(defmethod sql-jdbc.execute/read-column-thunk [::use-legacy-classes-for-read-and-set Types/DATE]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs i) [DATE] -> %s -> %s" (pr-str s) (pr-str t))
        t))))

(defmethod sql-jdbc.execute/read-column-thunk [::use-legacy-classes-for-read-and-set Types/TIMESTAMP]
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (when-let [s (.getString rs i)]
      (let [t (u.date/parse s)]
        (log/tracef "(.getString rs i) [TIMESTAMP] -> %s -> %s" (pr-str s) (pr-str t))
        t))))

(doseq [dispatch-val (keys (methods sql-jdbc.execute/read-column-thunk))
        :when        (sequential? dispatch-val)
        :let         [[driver jdbc-type] dispatch-val]
        :when        (= driver ::use-legacy-classes-for-read-and-set)]
  (prefer-method sql-jdbc.execute/read-column-thunk dispatch-val [:sql-jdbc jdbc-type]))
