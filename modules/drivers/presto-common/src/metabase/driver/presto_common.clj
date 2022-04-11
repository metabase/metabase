(ns metabase.driver.presto-common
  "Abstract common driver for Presto. It only defines SQL generation logic and doesn't involve the transport/execution
  mechanism for actually connecting to Presto."
  (:require [buddy.core.codecs :as codecs]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [honeysql.helpers :as h]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util :as sql.u]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.honeysql-extensions :as hx])
  (:import java.sql.Time
           [java.time OffsetDateTime ZonedDateTime]))

(driver/register! :presto-common, :abstract? true, :parent :sql)

;;; Presto API helpers

(def presto-type->base-type
  "Function that returns a `base-type` for the given `presto-type` (can be a keyword or string)."
  (sql-jdbc.sync/pattern-based-database-type->base-type
    [[#"(?i)boolean"                    :type/Boolean]
     [#"(?i)tinyint"                    :type/Integer]
     [#"(?i)smallint"                   :type/Integer]
     [#"(?i)integer"                    :type/Integer]
     [#"(?i)bigint"                     :type/BigInteger]
     [#"(?i)real"                       :type/Float]
     [#"(?i)double"                     :type/Float]
     [#"(?i)decimal.*"                  :type/Decimal]
     [#"(?i)varchar.*"                  :type/Text]
     [#"(?i)char.*"                     :type/Text]
     [#"(?i)varbinary.*"                :type/*]
     [#"(?i)json"                       :type/Text] ; TODO - this should probably be Dictionary or something
     [#"(?i)date"                       :type/Date]
     [#"(?i)^timestamp$"                :type/DateTime]
     [#"(?i)^timestamp with time zone$" :type/DateTimeWithTZ]
     [#"(?i)^time$"                     :type/Time]
     [#"(?i)^time with time zone$"      :type/TimeWithTZ]
     #_[#"(?i)time.+"                     :type/DateTime] ; TODO - get rid of this one?
     [#"(?i)array"                      :type/Array]
     [#"(?i)map"                        :type/Dictionary]
     [#"(?i)row.*"                      :type/*] ; TODO - again, but this time we supposedly have a schema
     [#".*"                             :type/*]]))

(defmethod sql.qp/add-interval-honeysql-form :presto-common
  [_ hsql-form amount unit]
  (hsql/call :date_add (hx/literal unit) amount hsql-form))

(defn describe-catalog-sql
  "The SHOW SCHEMAS statement that will list all schemas for the given `catalog`."
  {:added "0.39.0"}
  [driver catalog]
  (str "SHOW SCHEMAS FROM " (sql.u/quote-name driver :database catalog)))

(defn describe-schema-sql
  "The SHOW TABLES statement that will list all tables for the given `catalog` and `schema`."
  {:added "0.39.0"}
  [driver catalog schema]
  (str "SHOW TABLES FROM " (sql.u/quote-name driver :schema catalog schema)))

(defn describe-table-sql
  "The DESCRIBE  statement that will list information about the given `table`, in the given `catalog` and schema`."
  {:added "0.39.0"}
  [driver catalog schema table]
  (str "DESCRIBE " (sql.u/quote-name driver :table catalog schema table)))

(def excluded-schemas
  "The set of schemas that should be excluded when querying all schemas."
  #{"information_schema"})

(defmethod driver/db-start-of-week :presto-common
  [_]
  :monday)

(defmethod sql.qp/cast-temporal-string [:presto-common :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_ _coercion-strategy expr]
  (hsql/call :date_parse expr (hx/literal "%Y%m%d%H%i%s")))

(defmethod sql.qp/cast-temporal-byte [:presto-common :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
    (hsql/call :from_utf8 expr)))

(defmethod sql.qp/->honeysql [:presto-common Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sql.qp/->honeysql [:presto-common :time]
  [_ [_ t]]
  (hx/cast :time (u.date/format-sql (t/local-time t))))

(defmethod sql.qp/->float :presto-common
  [_ value]
  (hx/cast :double value))

(defmethod sql.qp/->honeysql [:presto-common :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_extract (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/->honeysql [:presto-common :median]
  [driver [_ arg]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) 0.5))

(defmethod sql.qp/->honeysql [:presto-common :percentile]
  [driver [_ arg p]]
  (hsql/call :approx_percentile (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver p)))

;; Presto mod is a function like mod(x, y) rather than an operator like x mod y
(defmethod hformat/fn-handler (u/qualified-name ::mod)
  [_ x y]
  (format "mod(%s, %s)" (hformat/to-sql x) (hformat/to-sql y)))

(def ^:dynamic *param-splice-style*
  "How we should splice params into SQL (i.e. 'unprepare' the SQL). Either `:friendly` (the default) or `:paranoid`.
  `:friendly` makes a best-effort attempt to escape strings and generate SQL that is nice to look at, but should not
  be considered safe against all SQL injection -- use this for 'convert to SQL' functionality. `:paranoid` hex-encodes
  strings so SQL injection is impossible; this isn't nice to look at, so use this for actually running a query."
  :friendly)

(defmethod unprepare/unprepare-value [:presto-common String]
  [_ ^String s]
  (case *param-splice-style*
    :friendly (str \' (sql.u/escape-sql s :ansi) \')
    :paranoid (format "from_utf8(from_hex('%s'))" (codecs/bytes->hex (.getBytes s "UTF-8")))))

;; See https://prestodb.io/docs/current/functions/datetime.html

;; This is only needed for test purposes, because some of the sample data still uses legacy types
(defmethod unprepare/unprepare-value [:presto-common Time]
  [driver t]
  (unprepare/unprepare-value driver (t/local-time t)))

(defmethod unprepare/unprepare-value [:presto-common OffsetDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-offset t)))

(defmethod unprepare/unprepare-value [:presto-common ZonedDateTime]
  [_ t]
  (format "timestamp '%s %s %s'" (t/local-date t) (t/local-time t) (t/zone-id t)))

;;; `:sql-driver` methods

(defmethod sql.qp/apply-top-level-clause [:presto-common :page]
  [_ _ honeysql-query {{:keys [items page]} :page}]
  (let [offset (* (dec page) items)]
    (if (zero? offset)
      ;; if there's no offset we can simply use limit
      (h/limit honeysql-query items)
      ;; if we need to do an offset we have to do nesting to generate a row number and where on that
      (let [over-clause (format "row_number() OVER (%s)"
                                (first (hsql/format (select-keys honeysql-query [:order-by])
                                                    :allow-dashed-names? true
                                                    :quoting :ansi)))]
        (-> (apply h/select (map last (:select honeysql-query)))
            (h/from (h/merge-select honeysql-query [(hsql/raw over-clause) :__rownum__]))
            (h/where [:> :__rownum__ offset])
            (h/limit items))))))

(defmethod sql.qp/date [:presto-common :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:presto-common :minute]          [_ _ expr] (hsql/call :date_trunc (hx/literal :minute) expr))
(defmethod sql.qp/date [:presto-common :minute-of-hour]  [_ _ expr] (hsql/call :minute expr))
(defmethod sql.qp/date [:presto-common :hour]            [_ _ expr] (hsql/call :date_trunc (hx/literal :hour) expr))
(defmethod sql.qp/date [:presto-common :hour-of-day]     [_ _ expr] (hsql/call :hour expr))
(defmethod sql.qp/date [:presto-common :day]             [_ _ expr] (hsql/call :date_trunc (hx/literal :day) expr))
(defmethod sql.qp/date [:presto-common :day-of-month]    [_ _ expr] (hsql/call :day expr))
(defmethod sql.qp/date [:presto-common :day-of-year]     [_ _ expr] (hsql/call :day_of_year expr))

(defmethod sql.qp/date [:presto-common :day-of-week]
  [driver _ expr]
  (sql.qp/adjust-day-of-week driver (hsql/call :day_of_week expr)))

(defmethod sql.qp/date [:presto-common :week]
  [driver _ expr]
  (sql.qp/adjust-start-of-week driver (partial hsql/call :date_trunc (hx/literal :week)) expr))

(defmethod sql.qp/date [:presto-common :month]           [_ _ expr] (hsql/call :date_trunc (hx/literal :month) expr))
(defmethod sql.qp/date [:presto-common :month-of-year]   [_ _ expr] (hsql/call :month expr))
(defmethod sql.qp/date [:presto-common :quarter]         [_ _ expr] (hsql/call :date_trunc (hx/literal :quarter) expr))
(defmethod sql.qp/date [:presto-common :quarter-of-year] [_ _ expr] (hsql/call :quarter expr))
(defmethod sql.qp/date [:presto-common :year]            [_ _ expr] (hsql/call :date_trunc (hx/literal :year) expr))

(defmethod sql.qp/unix-timestamp->honeysql [:presto-common :seconds]
  [_ _ expr]
  (hsql/call :from_unixtime expr))

(defmethod driver.common/current-db-time-date-formatters :presto-common
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSZ"))

(defmethod driver.common/current-db-time-native-query :presto-common
  [_]
  "select to_iso8601(current_timestamp)")

(defmethod driver/current-db-time :presto-common
  [& args]
  (apply driver.common/current-db-time args))

(doseq [[feature supported?] {:set-timezone                    true
                              :basic-aggregations              true
                              :standard-deviation-aggregations true
                              :expressions                     true
                              :native-parameters               true
                              :expression-aggregations         true
                              :binning                         true
                              :foreign-keys                    true}]
  (defmethod driver/supports? [:presto-common feature] [_ _] supported?))
