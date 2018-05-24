(ns metabase.driver.crate.util
  (:refer-clojure :exclude [second])
  (:require [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]])
  (:import java.sql.Timestamp))

;; register the try_cast function with HoneySQL
;; (hsql/format (hsql/call :crate-try-cast :TIMESTAMP :field)) -> "try_cast(field as TIMESTAMP)"
(defmethod hformat/fn-handler "crate-try-cast" [_ klass expr]
  (str "try_cast(" (hformat/to-sql expr) " as " (name klass) ")"))

(defn unix-timestamp->timestamp
  "Converts datetime string to a valid timestamp"
  [_ expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (recur nil (hx/* expr 1000) :milliseconds)
    :milliseconds (hsql/call :crate-try-cast :TIMESTAMP expr)))

(defn- date-trunc
  "date_trunc('interval', timezone, timestamp): truncates a timestamp to a given interval"
  [unit expr]
  (let [timezone (get-in qp/*query* [:settings :report-timezone])]
    (if (nil? timezone)
      (hsql/call :date_trunc (hx/literal unit) expr)
      (hsql/call :date_trunc (hx/literal unit) timezone expr))))

(defn- date-format
  "date_format('format_string', timezone, timestamp): formats the timestamp as string"
  [fmt expr]
  (let [timezone (get-in qp/*query* [:settings :report-timezone])]
    (if (nil? timezone)
      (hsql/call :date_format fmt expr)
      (hsql/call :date_format fmt timezone expr))))

(defn- extract
  "extract(field from expr): extracts subfields of a timestamp"
  [unit expr]
  (if-not (= unit :day_of_week)
    (hsql/call :extract unit expr)
    ;; Crate DOW starts with Monday (1) to Sunday (7)
    (hx/+ (hx/mod (hsql/call :extract unit expr)
                  7)
          1)))

(def ^:private extract-integer (comp hx/->integer extract))

(def ^:private ^:const second 1000)
(def ^:private ^:const minute (* 60 second))
(def ^:private ^:const hour   (* 60 minute))
(def ^:private ^:const day    (* 24 hour))
(def ^:private ^:const week   (* 7 day))
(def ^:private ^:const year   (* 365 day))
(def ^:private ^:const month  (Math/round (float (/ year 12))))

(defn date
  "ISQLDriver `date` implementation"
  [_ unit expr]
  (let [v (if (instance? Timestamp expr)
            (hx/literal (du/date->iso-8601 expr))
            expr)]
    (case unit
      :default         (date-format (str "%Y-%m-%d %H:%i:%s") v)
      :second          (date-format (str "%Y-%m-%d %H:%i:%s") (date-trunc :second v))
      :minute          (date-format (str "%Y-%m-%d %H:%i:%s") (date-trunc :minute v))
      :minute-of-hour  (extract-integer :minute v)
      :hour            (date-format (str "%Y-%m-%d %H:%i:%s") (date-trunc :hour v))
      :hour-of-day     (extract-integer :hour v)
      :day             (date-format (str "%Y-%m-%d") (date-trunc :day v))
      :day-of-week     (extract-integer :day_of_week v)
      :day-of-month    (extract-integer :day_of_month v)
      :day-of-year     (extract-integer :day_of_year v)
      ;; Crate weeks start on Monday, so shift this date into the proper bucket and then decrement the resulting day
      :week            (date-format (str "%Y-%m-%d") (hx/- (date-trunc :week (hx/+ v day)) day))
      :week-of-year    (extract-integer :week v)
      :month           (date-format (str "%Y-%m-%d") (date-trunc :month v))
      :month-of-year   (extract-integer :month v)
      :quarter         (date-format (str "%Y-%m-%d") (date-trunc :quarter v))
      :quarter-of-year (extract-integer :quarter v)
      :year            (extract-integer :year v))))

(defn- sql-interval [unit amount]
  (format "current_timestamp + %d" (* unit amount)))

(defn date-interval
  "defines the sql command required for date-interval calculation"
  [_ unit amount]
  (case unit
    :quarter (recur nil :month (hx/* amount 3))
    :year    (hsql/raw (sql-interval year   amount))
    :month   (hsql/raw (sql-interval month  amount))
    :week    (hsql/raw (sql-interval week   amount))
    :day     (hsql/raw (sql-interval day    amount))
    :hour    (hsql/raw (sql-interval hour   amount))
    :minute  (hsql/raw (sql-interval minute amount))
    :second  (hsql/raw (sql-interval second amount))))
