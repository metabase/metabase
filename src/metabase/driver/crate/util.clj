(ns metabase.driver.crate.util
  (:require [metabase.util.korma-extensions :as kx]
            [korma.sql.utils :as kutils]
            [korma.core :as k]
            [metabase.util :as u]
            [metabase.driver.generic-sql.query-processor :as qp])
  (:import (java.sql Timestamp)))

(defn unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  "Converts datetime string to a valid timestamp"
  (case seconds-or-milliseconds
    :seconds      (recur nil (kx/* expr 1000) :milliseconds)
    :milliseconds (kutils/func (str "TRY_CAST(%s as TIMESTAMP)") [expr])))

(defn- date-trunc [unit expr]
  "date_trunc('interval', timezone, timestamp): truncates a timestamp to a given interval"
  (let [timezone    (get-in qp/*query* [:settings :report-timezone])]
    (if (= (nil? timezone) true)
      (k/sqlfn :DATE_TRUNC (kx/literal unit) expr)
      (k/sqlfn :DATE_TRUNC (kx/literal unit) timezone expr))))

(defn- date-format [format expr]
  "date_format('format_string', timezone, timestamp): formats the timestamp as string"
  (let [timezone    (get-in qp/*query* [:settings :report-timezone])]
    (if (nil? timezone)
      (k/sqlfn :DATE_FORMAT format expr)
      (k/sqlfn :DATE_FORMAT format timezone expr))))

(defn- extract    [unit expr]
  "extract(field from expr): extracts subfields of a timestamp"
  (case unit
    ;; Crate DOW starts with Monday (1) to Sunday (7)
    :day_of_week (kx/+ (kx/mod (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit)) [expr]) 7) 1)
    (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit)) [expr])))

(def ^:private extract-integer
  (comp kx/->integer extract))

(def ^:private ^:const second 1000)
(def ^:private ^:const minute (* 60 second))
(def ^:private ^:const hour   (* 60 minute))
(def ^:private ^:const day    (* 24 hour))
(def ^:private ^:const week   (* 7 day))
(def ^:private ^:const year   (* 365 day))
(def ^:private ^:const month  (Math/round (float (/ year 12))))

(defn date [_ unit expr]
  (let [v (if (instance? Timestamp expr)
            (kx/literal (u/date->iso-8601 expr))
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
      :week            (date-format (str "%Y-%m-%d") (kx/- (date-trunc :week (kx/+ v day)) day))
      :week-of-year    (extract-integer :week v)
      :month           (date-format (str "%Y-%m-%d") (date-trunc :month v))
      :month-of-year   (extract-integer :month v)
      :quarter         (date-format (str "%Y-%m-%d") (date-trunc :quarter v))
      :quarter-of-year (extract-integer :quarter v)
      :year            (extract-integer :year v))))

(defn- sql-interval [unit amount]
  (format "CURRENT_TIMESTAMP + %d" (* unit amount)))

(defn date-interval [_ unit amount]
  "defines the sql command required for date-interval calculation"
  (case unit
    :quarter (recur nil :month (kx/* amount 3))
    :year (k/raw (sql-interval year amount))
    :month (k/raw (sql-interval month amount))
    :week (k/raw (sql-interval week amount))
    :day (k/raw (sql-interval day amount))
    :hour (k/raw (sql-interval hour amount))
    :minute (k/raw (sql-interval minute amount))
    :second (k/raw (sql-interval second amount))))
