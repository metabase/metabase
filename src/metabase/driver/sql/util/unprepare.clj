(ns metabase.driver.sql.util.unprepare
  "Utility functions for converting a prepared statement with `?` param placeholders into a plain SQL query by splicing
  params in place.

  TODO -- since this is no longer strictly a 'util' namespace (most `:sql-jdbc` drivers need to implement one or
  methods from here) let's rename this `metabase.driver.sql.unprepare` when we get a chance."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql.util :as sql.u]
            [metabase.util.i18n :refer [trs]])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]))

(defmulti unprepare-value
  "Convert a single argument to appropriate raw SQL for splicing directly into a SQL query. Dispatches on both driver
  and the class of `value`."
  {:arglists '([driver value])}
  (fn [driver value]
    [(driver/the-initialized-driver driver) (class value)])
  :hierarchy #'driver/hierarchy)

(defmethod unprepare-value :default
  [_ value]
  ;; it's better return a slightly broken SQL query with a probably incorrect string representation of the value than
  ;; to have the entire QP run fail because of an unknown type.
  (log/warn (trs "Don''t know how to unprepare values of class {0}" (.getName (class value))))
  (str value))

(defmethod unprepare-value [:sql nil]
  [_ _]
  "NULL")

(defmethod unprepare-value [:sql String]
  [_ s]
  ;; escape single-quotes like Cam's String -> Cam''s String
  (str \' (sql.u/escape-sql s :ansi) \'))

(defmethod unprepare-value [:sql Boolean]
  [_ value]
  (if value "TRUE" "FALSE"))

(defmethod unprepare-value [:sql Number]
  [_ value]
  (str value))

(defmethod unprepare-value [:sql LocalDate]
  [_ t]
  (format "date '%s'" (t/format "yyyy-MM-dd" t)))

(defmethod unprepare-value [:sql LocalTime]
  [_ t]
  (format "time '%s'" (t/format "HH:mm:ss.SSS" t)))

(defmethod unprepare-value [:sql OffsetTime]
  [_ t]
  (format "time with time zone '%s'" (t/format "HH:mm:ss.SSSZZZZZ" t)))

(defmethod unprepare-value [:sql LocalDateTime]
  [_ t]
  (format "timestamp '%s'" (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)))

(defmethod unprepare-value [:sql OffsetDateTime]
  [_ t]
  (format "timestamp with time zone '%s'" (t/format "yyyy-MM-dd HH:mm:ss.SSSZZZZZ" t)))

(defmethod unprepare-value [:sql ZonedDateTime]
  [_ t]
  (format "timestamp with time zone '%s'" (t/format "yyyy-MM-dd HH:mm:ss.SSSZZZZZ" t)))

;; TODO - pretty sure we can remove this
(defmethod unprepare-value [:sql Instant]
  [driver t]
  (unprepare-value driver (t/offset-date-time t (t/zone-offset 0))))


;; TODO - I think a name like `deparameterize` would be more appropriate here
(defmulti ^String unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement.
  Implementations should return a plain SQL string.

  Drivers likely do not need to implement this method themselves -- instead, you should only need to provide
  implementations of `unprepare-value` for the cases where it is needed."
  {:arglists '([driver [sql & args]]), :style/indent 1}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod unprepare :sql [driver [sql & args]]
  (transduce
   identity
   (completing
    (fn [sql arg]
      ;; Only match single question marks; do not match ones like `??` which JDBC converts to `?` to use as Postgres
      ;; JSON operators amongst other things.
      ;;
      ;; TODO - this is not smart enough to handle question marks in non argument contexts, for example if someone
      ;; were to have a question mark inside an identifier such as a table name. I think we'd have to parse the SQL in
      ;; order to handle those situations.
      (let [v (str (unprepare-value driver arg))]
        (log/tracef "Splice %s as %s" (pr-str arg) (pr-str v))
        (str/replace-first sql #"(?<!\?)\?(?!\?)" (str/re-quote-replacement v))))
    (fn [spliced-sql]
      (log/tracef "Spliced %s\n-> %s" (u/colorize 'green (pr-str sql)) (u/colorize 'blue (pr-str spliced-sql)))
      spliced-sql))
   sql
   args))
