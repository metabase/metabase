(ns metabase.driver.sql.util.unprepare
  "Utility functions for converting a prepared statement with `?` into a plain SQL query.

  TODO - since this is no longer strictly a 'util' namespace (most `:sql-jdbc` drivers need to implement one or
  methods from here) let's rename this `metabase.driver.sql.unprepare` when we get a chance."
  (:require [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase.driver :as driver]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]])
  (:import java.sql.Time
           java.util.Date))

(defmulti unprepare-value
  "Convert a single argument to appropriate raw SQL for splicing directly into a SQL query. Dispatches on both driver
  and the class of `value`."
  {:arglists '([driver value])}
  (fn [driver value]
    [(driver/the-initialized-driver driver) (class value)])
  :hierarchy #'driver/hierarchy)

(defmethod unprepare-value [:sql nil] [_ _]
  "NULL")

(defmethod unprepare-value [:sql String] [_ value]
  ;; escape single-quotes like Cam's String -> Cam''s String
  (str \' (str/replace value "'" "''") \'))

(defmethod unprepare-value [:sql Boolean] [_ value]
  (if value "TRUE" "FALSE"))

(defmethod unprepare-value [:sql Number] [_ value]
  (str value))

(defn unprepare-date-with-iso-8601-fn
  "Convert a Date to appropriate raw SQL by passing an ISO-8601 literal string to the function named by `iso-8601-fn`.
  You can use this function to create implementations of `unprepare-value` for Date values."
  [iso-8601-fn value]
  (hformat/to-sql
   (hsql/call iso-8601-fn (hx/literal (du/date->iso-8601 value)))))

(defmethod unprepare-value [:sql Date] [_ value]
  (unprepare-date-with-iso-8601-fn :timestamp value))

;; default impl for Time is just converting the Time literal to a `1970-01-01T<time>` Timestamp and passing to impl
;; for `Date`, then wrapping entire expression in `time()`
(defmethod unprepare-value [:sql Time] [driver value]
  (hformat/to-sql (hx/->time (hsql/raw (unprepare-value driver (du/->Timestamp value))))))


(defmulti ^String unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement.
  Implementations should return a plain SQL string.

  Drivers likely do not need to implement this method themselves -- instead, you should only need to provide
  implementations of `unprepare-value` for the cases where it is needed."
  {:arglists '([driver [sql & args]]), :style/indent 1}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod unprepare :sql [driver [sql & args]]
  (loop [sql sql, [arg & more-args, :as args] args]
    (if-not (seq args)
      sql
      ;; Only match single question marks; do not match ones like `??` which JDBC converts to `?` to use as Postgres
      ;; JSON operators amongst other things.
      ;;
      ;; TODO - this is not smart enough to handle question marks in non argument contexts, for example if someone
      ;; were to have a question mark inside an identifier such as a table name. I think we'd have to parse the SQL in
      ;; order to handle those situations.
      (recur
       (str/replace-first sql #"(?<!\?)\?(?!\?)" (unprepare-value driver arg))
       more-args))))
