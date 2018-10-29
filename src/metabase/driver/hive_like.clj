(ns metabase.driver.hive-like
  (:require [clojure.java.jdbc :as jdbc]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import java.util.Date))

(def column->base-type
  "Map of Spark SQL (Hive) column types -> Field base types.
   Add more mappings here as you come across them."
  {;; Numeric types
   :tinyint                     :type/Integer
   :smallint                    :type/Integer
   :int                         :type/Integer
   :integer                     :type/Integer
   :bigint                      :type/BigInteger
   :float                       :type/Float
   :double                      :type/Float
   (keyword "double precision") :type/Float
   :decimal                     :type/Decimal
   ;; Date/Time types
   :timestamp                   :type/DateTime
   :date                        :type/Date
   :interval                    :type/*
   :string                      :type/Text
   :varchar                     :type/Text
   :char                        :type/Text
   :boolean                     :type/Boolean
   :binary                      :type/*})

(def now
  "A SQL function call returning the current time"
  (hsql/raw "NOW()"))

(defn unix-timestamp->timestamp
  "Converts datetime string to a valid timestamp"
  [expr seconds-or-milliseconds]
  (hx/->timestamp
   (hsql/call :from_unixtime (case seconds-or-milliseconds
                               :seconds      expr
                               :milliseconds (hx// expr 1000)))))

(defn- date-format [format-str expr]
  (hsql/call :date_format expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hx/->timestamp
   (hsql/call :from_unixtime
              (hsql/call :unix_timestamp
                         expr (hx/literal format-str)))))

(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn date
  "Converts `expr` into a date, truncated to `unit`, using Hive SQL dialect functions"
  [unit expr]
  (case unit
    :default         expr
    :minute          (trunc-with-format "yyyy-MM-dd HH:mm" (hx/->timestamp expr))
    :minute-of-hour  (hsql/call :minute (hx/->timestamp expr))
    :hour            (trunc-with-format "yyyy-MM-dd HH" (hx/->timestamp expr))
    :hour-of-day     (hsql/call :hour (hx/->timestamp expr))
    :day             (trunc-with-format "yyyy-MM-dd" (hx/->timestamp expr))
    :day-of-week     (hx/->integer (date-format "u"
                                                (hx/+ (hx/->timestamp expr)
                                                      (hsql/raw "interval '1' day"))))
    :day-of-month    (hsql/call :dayofmonth (hx/->timestamp expr))
    :day-of-year     (hx/->integer (date-format "D" (hx/->timestamp expr)))
    :week            (hsql/call :date_sub
                       (hx/+ (hx/->timestamp expr)
                             (hsql/raw "interval '1' day"))
                       (date-format "u"
                                    (hx/+ (hx/->timestamp expr)
                                          (hsql/raw "interval '1' day"))))
    :week-of-year    (hsql/call :weekofyear (hx/->timestamp expr))
    :month           (hsql/call :trunc (hx/->timestamp expr) (hx/literal :MM))
    :month-of-year   (hsql/call :month (hx/->timestamp expr))
    :quarter         (hsql/call :add_months
                       (hsql/call :trunc (hx/->timestamp expr) (hx/literal :year))
                       (hx/* (hx/- (hsql/call :quarter (hx/->timestamp expr))
                                   1)
                             3))
    :quarter-of-year (hsql/call :quarter (hx/->timestamp expr))
    :year            (hsql/call :year (hx/->timestamp expr))))

(defn date-interval
  "Returns a SQL expression to calculate a time interval using the Hive SQL dialect"
  [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d' %s)" (int amount) (name unit))))

(defn string-length-fn
  "A SQL function call that returns the string length of `field-key`"
  [field-key]
  (hsql/call :length field-key))

;; ignore the schema when producing the identifier
(defn qualified-name-components
  "Return the pieces that represent a path to FIELD, of the form `[table-name parent-fields-name* field-name]`.
   This function should be used by databases where schemas do not make much sense."
  [{field-name :name, table-id :table_id, parent-id :parent_id}]
  ;; TODO - we are making too many DB calls here!
  ;; (At least this is only used for SQL parameters, which is why we can't currently use the Store)
  (conj (vec (if-let [parent (Field parent-id)]
               (qualified-name-components parent)
               (let [{table-name :name, schema :schema} (db/select-one [Table :name :schema], :id table-id)]
                 [table-name])))
        field-name))

(defn field->identifier
  "Returns an identifier for the given field"
  [field]
  (apply hsql/qualify (qualified-name-components field)))

(defn- run-query
  "Run the query itself."
  [{sql :query, params :params, remark :remark} connection]
  (let [sql              (str "-- " remark "\n" (hx/unescape-dots sql))
        statement        (into [sql] params)
        [columns & rows] (jdbc/query connection statement {:identifiers identity, :as-arrays? true})]
    {:rows    (or rows [])
     :columns (map u/keyword->qualified-name columns)}))

(defn run-query-without-timezone
  "Runs the given query without trying to set a timezone"
  [_ _ connection query]
  (run-query query connection))

(defmethod hformat/fn-handler "hive-like-from-unixtime" [_ datetime-literal]
  (hformat/to-sql
   (hsql/call :from_unixtime
     (hsql/call :unix_timestamp
       datetime-literal
       (hx/literal "yyyy-MM-dd\\\\'T\\\\'HH:mm:ss.SSS\\\\'Z\\\\'")))))

(defn unprepare
  "Convert a normal SQL `[statement & prepared-statement-args]` vector into a flat, non-prepared statement.
   Deals with iso-8601-fn in a Hive compatible way"
  [sql-and-args]
  (unprepare/unprepare sql-and-args :iso-8601-fn :hive-like-from-unixtime))
