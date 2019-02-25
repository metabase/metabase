(ns metabase.driver.hive-like
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [honeysql
             [core :as hsql]
             [format :as hformat]]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]]
            [toucan.db :as db])
  (:import [java.sql PreparedStatement Time] java.util.Date))

(driver/register! :hive-like, :parent :sql-jdbc, :abstract? true)

(defmethod sql-jdbc.sync/database-type->base-type :hive-like [_ database-type]
  ({ ;; Numeric types
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
    :binary                      :type/*} database-type))

(defmethod sql.qp/current-datetime-fn :hive-like [_] :%now)

(defmethod sql.qp/unix-timestamp->timestamp [:hive-like :seconds] [_ _ expr]
  (hx/->timestamp (hsql/call :from_unixtime expr)))

(defn- date-format [format-str expr]
  (hsql/call :date_format expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hx/->timestamp
   (hsql/call :from_unixtime
              (hsql/call :unix_timestamp
                         expr (hx/literal format-str)))))

(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defmethod sql.qp/date [:hive-like :minute]          [_ _ expr] (trunc-with-format "yyyy-MM-dd HH:mm" (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :minute-of-hour]  [_ _ expr] (hsql/call :minute (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :hour]            [_ _ expr] (trunc-with-format "yyyy-MM-dd HH" (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :hour-of-day]     [_ _ expr] (hsql/call :hour (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day]             [_ _ expr] (trunc-with-format "yyyy-MM-dd" (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day-of-month]    [_ _ expr] (hsql/call :dayofmonth (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :day-of-year]     [_ _ expr] (hx/->integer (date-format "D" (hx/->timestamp expr))))
(defmethod sql.qp/date [:hive-like :week-of-year]    [_ _ expr] (hsql/call :weekofyear (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :month]           [_ _ expr] (hsql/call :trunc (hx/->timestamp expr) (hx/literal :MM)))
(defmethod sql.qp/date [:hive-like :month-of-year]   [_ _ expr] (hsql/call :month (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :quarter-of-year] [_ _ expr] (hsql/call :quarter (hx/->timestamp expr)))
(defmethod sql.qp/date [:hive-like :year]            [_ _ expr] (hsql/call :year (hx/->timestamp expr)))

(defmethod sql.qp/date [:hive-like :day-of-week] [_ _ expr]
  (hx/->integer (date-format "u"
                             (hx/+ (hx/->timestamp expr)
                                   (hsql/raw "interval '1' day")))))

(defmethod sql.qp/date [:hive-like :week] [_ _ expr]
  (hsql/call :date_sub
    (hx/+ (hx/->timestamp expr)
          (hsql/raw "interval '1' day"))
    (date-format "u"
                 (hx/+ (hx/->timestamp expr)
                       (hsql/raw "interval '1' day")))))

(defmethod sql.qp/date [:hive-like :quarter] [_ _ expr]
  (hsql/call :add_months
    (hsql/call :trunc (hx/->timestamp expr) (hx/literal :year))
    (hx/* (hx/- (hsql/call :quarter (hx/->timestamp expr))
                1)
          3)))

(defmethod driver/date-interval :hive-like [_ unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d' %s)" (int amount) (name unit))))

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

(defmethod sql.qp/field->identifier :hive-like [_ field]
  (apply hsql/qualify (qualified-name-components field)))

(defn- run-query
  "Run the query itself."
  [{sql :query, :keys [params remark max-rows]} connection]
  (let [sql     (str "-- " remark "\n" (hx/unescape-dots sql))
        options {:identifiers identity
                 :as-arrays?  true
                 :max-rows    max-rows}]
    (with-open [connection (jdbc/get-connection connection)]
      (with-open [^PreparedStatement statement (jdbc/prepare-statement connection sql options)]
        (let [statement        (into [statement] params)
              [columns & rows] (jdbc/query connection statement options)]
          {:rows    (or rows [])
           :columns (map u/keyword->qualified-name columns)})))))

(defn run-query-without-timezone
  "Runs the given query without trying to set a timezone"
  [_ _ connection query]
  (run-query query connection))

(defmethod unprepare/unprepare-value [:hive-like Date] [_ value]
  (hformat/to-sql
   (hsql/call :from_unixtime
     (hsql/call :unix_timestamp
       (hx/literal (du/date->iso-8601 value))
       (hx/literal "yyyy-MM-dd\\\\'T\\\\'HH:mm:ss.SSS\\\\'Z\\\\'")))))

(prefer-method unprepare/unprepare-value [:sql Time] [:hive-like Date])

(defmethod unprepare/unprepare-value [:hive-like String] [_ value]
  (str \' (str/replace value "'" "\\\\'") \'))
