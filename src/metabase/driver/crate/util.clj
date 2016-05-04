(ns metabase.driver.crate.util
  (:require [metabase.util.korma-extensions :as kx]
            [korma.sql.utils :as kutils]
            [korma.core :as k]
            [metabase.util :as u]
            [metabase.driver :as driver])
  (:import (java.sql Timestamp)))

(defn unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  "Converts datetime string to a valid timestamp"
  (case seconds-or-milliseconds
    :seconds      (recur nil (kx/* expr 1000) :milliseconds)
    :milliseconds (kutils/func (str "TRY_CAST(%s as TIMESTAMP)") [expr])))

(defn- date-trunc [unit expr]
  "date_trunc('interval', timezone, timestamp): truncates a timestamp to a given interval"
  (if (or (nil? (driver/report-timezone)) (= (count (driver/report-timezone)) 0))
    (k/sqlfn :DATE_TRUNC (kx/literal unit) expr)
    (k/sqlfn :DATE_TRUNC (kx/literal unit) (driver/report-timezone) expr)))

(defn- date-format [format expr]
  "date_format('format_string', timezone, timestamp): formats the timestamp as string"
  (if (or (nil? (driver/report-timezone)) (= (count (driver/report-timezone)) 0))
    (k/sqlfn :DATE_FORMAT format expr)
    (k/sqlfn :DATE_FORMAT format (driver/report-timezone) expr)))

(defn- extract    [unit expr]
  "extract(field from expr): extracts subfields of a timestamp"
  (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit)) [expr]))

(def ^:private extract-integer
  (comp kx/->integer extract))

(def ^:private YEAR   (constantly 31536000000))
(def ^:private MONTH  (constantly 2628000000))
(def ^:private WEEK   (constantly 604800000))
(def ^:private DAY    (constantly 86400000))
(def ^:private HOUR   (constantly 3600000))
(def ^:private MINUTE (constantly 60000))
(def ^:private SECOND (constantly 1000))

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
      :week            (date-format (str "%Y-%m-%d") (date-trunc :week v))
      :week-of-year    (extract-integer :week v)
      :month           (date-format (str "%Y-%m-%d") (date-trunc :month v))
      :month-of-year   (extract-integer :month v)
      :quarter         (date-format (str "%Y-%m-%d") (date-trunc :quarter v))
      :quarter-of-year (extract-integer :quarter v)
      :year            (extract-integer :year v))))

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
