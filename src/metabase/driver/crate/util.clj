(ns metabase.driver.crate.util
  (:require [metabase.util.korma-extensions :as kx]
            [korma.sql.utils :as kutils]
            [korma.core :as k]
            [clj-time.core :as t]
            [clj-time.coerce :as c]
            [clj-time.format :as f]
            [metabase.util :as u])
  (:import (java.sql Timestamp)))

(defn unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  "Converts datetime string to a valid timestamp"
  (case seconds-or-milliseconds
    :seconds       (kutils/func (format "TRY_CAST('%s' as TIMESTAMP)" seconds-or-milliseconds) [expr])
    :milliseconds  (recur nil (kx// expr 1000) :seconds)))

(defn- convert-to-isotime
  "Prints datetime as ISO time"
  [sql-time format]
  (if (= (instance? Timestamp sql-time) true)
    (f/unparse (f/formatters format)
               (t/from-time-zone (c/from-sql-time sql-time)
                                 (t/time-zone-for-offset -2)))
    sql-time))

(defn- date-trunc [unit expr]
  "date_trunc('interval', timestamp): truncates a timestamp to a given interval"
  (k/sqlfn :DATE_TRUNC (kx/literal unit) expr))

(defn- extract    [unit expr]
  "extract(field from expr): extracts subfields of a timestamp"
  (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit)) [expr]))

(def ^:private extract-integer
  (comp kx/->integer extract))

(defn date [_ unit expr]
  (case unit
    :default         (kx/->timestamp expr)
    :minute          (date-trunc :minute expr)
    :minute-of-hour  (extract-integer :minute expr)
    :hour            (date-trunc :hour expr)
    :hour-of-day     (extract-integer :hour expr)
    :day             (date-trunc :day (convert-to-isotime expr :date-hour-minute-second))
    :day-of-week     (extract-integer :day_of_week expr)
    :day-of-month    (extract-integer :day_of_month expr)
    :day-of-year     (extract-integer :day_of_year expr)
    :week            (date-trunc :week expr)
    :week-of-year    (extract-integer :week expr)
    :month           (date-trunc :month expr)
    :month-of-year   (extract-integer :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract-integer :quarter expr)
    :year            (extract-integer :year expr)))

(def ^:private YEAR   (constantly 31536000000))
(def ^:private MONTH  (constantly 2628000000))
(def ^:private WEEK   (constantly 604800000))
(def ^:private DAY    (constantly 86400000))
(def ^:private HOUR   (constantly 3600000))
(def ^:private MINUTE (constantly 60000))
(def ^:private SECOND (constantly 1000))

(defn- sql-interval [unit amount]
  (format "CURRENT_TIMESTAMP + %d" (* (unit) amount)))

(defn date-interval [_ unit amount]
  "defines the sql command required for date-interval calculation"
  (case unit
    :quarter (recur nil :month (kx/* amount 3))
    :year (k/raw (sql-interval YEAR amount))
    :month (k/raw (sql-interval MONTH amount))
    :week (k/raw (sql-interval WEEK amount))
    :day (k/raw (sql-interval DAY amount))
    :hour (k/raw (sql-interval HOUR amount))
    :minute (k/raw (sql-interval MINUTE amount))
    :second (k/raw (sql-interval SECOND amount))
    ))
