(ns metabase.driver.mysql
  "MySQL driver. Builds off of the SQL-JDBC driver."
  (:require [clj-time
             [coerce :as tcoerce]
             [core :as t]
             [format :as time]]
            [clojure
             [set :as set]
             [string :as str]]
            [honeysql.core :as hsql]
            [metabase.db.spec :as dbspec]
            [metabase.driver :as driver]
            [metabase.driver
             [common :as driver.common]
             [sql :as sql]]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]
             [ssh :as ssh]]
            [schema.core :as s])
  (:import java.sql.Time
           [java.util Date TimeZone]
           metabase.util.honeysql_extensions.Literal
           org.joda.time.format.DateTimeFormatter))

(driver/register! :mysql, :parent :sql-jdbc)

(defmethod driver/display-name :mysql [_] "MySQL")


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/connection-properties :mysql [_]
  (ssh/with-tunnel-config
    [driver.common/default-host-details
     (assoc driver.common/default-port-details :default 3306)
     driver.common/default-dbname-details
     driver.common/default-user-details
     driver.common/default-password-details
     (assoc driver.common/default-additional-options-details
       :placeholder  "tinyInt1isBit=false")]))


(defmethod driver/date-interval :mysql [_ unit amount]
  (hsql/call :date_add
    :%now
    (hsql/raw (format "INTERVAL %d %s" (int amount) (name unit)))))


(defmethod driver/humanize-connection-error-message :mysql [_ message]
  (condp re-matches message
    #"^Communications link failure\s+The last packet sent successfully to the server was 0 milliseconds ago. The driver has not received any packets from the server.$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^Unknown database .*$"
    (driver.common/connection-error-messages :database-name-incorrect)

    #"Access denied for user.*$"
    (driver.common/connection-error-messages :username-or-password-incorrect)

    #"Must specify port after ':' in connection string"
    (driver.common/connection-error-messages :invalid-hostname)

    #".*"                               ; default
    message))


(defmethod driver.common/current-db-time-date-formatters :mysql [_]
  (concat (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSS zzz")
          ;; In some timezones, MySQL doesn't return a timezone description but rather a truncated offset, such as
          ;; '-02'. That offset will fail to parse using a regular formatter
          (driver.common/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSS Z")))

(defmethod driver.common/current-db-time-native-query :mysql [_]
  "select CONCAT(DATE_FORMAT(current_timestamp, '%Y-%m-%d %H:%i:%S.%f' ), ' ', @@system_time_zone)")

(defmethod driver/current-db-time :mysql [& args]
  (apply driver.common/current-db-time args))


;; MySQL LIKE clauses are case-sensitive or not based on whether the collation of the server and the columns
;; themselves. Since this isn't something we can really change in the query itself don't present the option to the
;; users in the UI
(defmethod driver/supports? [:mysql :case-sensitivity-string-filter-options] [_ _] false)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/unix-timestamp->timestamp [:mysql :seconds] [_ _ expr]
  (hsql/call :from_unixtime expr))


(defn- date-format [format-str expr] (hsql/call :date_format expr (hx/literal format-str)))
(defn- str-to-date [format-str expr] (hsql/call :str_to_date expr (hx/literal format-str)))

(def ^:private ^DateTimeFormatter timezone-offset-formatter
  "JodaTime formatter that returns just the raw timezone offset, e.g. `-08:00` or `+00:00`."
  (time/formatter "ZZ"))

(defn- timezone-id->offset-str
  "Get an appropriate timezone offset string for a timezone with `timezone-id` and `date-time`. MySQL only accepts
  these offsets as strings like `-8:00`.

      (timezone-id->offset-str \"US/Pacific\", date-time) ; -> \"-08:00\"

  Returns `nil` if `timezone-id` is itself `nil`. The `date-time` must be included as some timezones vary their
  offsets at different times of the year (i.e. daylight savings time)."
  [^String timezone-id date-time]
  (when timezone-id
    (time/unparse (.withZone timezone-offset-formatter (t/time-zone-for-id timezone-id)) date-time)))

(def ^:private ^TimeZone utc   (TimeZone/getTimeZone "UTC"))
(def ^:private utc-hsql-offset (hx/literal "+00:00"))

(s/defn ^:private create-hsql-for-date
  "Returns an HoneySQL structure representing the date for MySQL. If there's a report timezone, we need to ensure the
  timezone conversion is wrapped around the `date-literal-or-string`. It supports both an `hx/literal` and a plain
  string depending on whether or not the date value should be emedded in the statement or separated as a prepared
  statement parameter. Use a string for prepared statement values, a literal if you want it embedded in the statement"
  [date-obj :- java.util.Date
   date-literal-or-string :- (s/either s/Str Literal)]
  (let [date-as-dt                 (tcoerce/from-date date-obj)
        report-timezone-offset-str (timezone-id->offset-str (driver/report-timezone) date-as-dt)]
    (if (and report-timezone-offset-str
             (not (.hasSameRules utc (TimeZone/getTimeZone (driver/report-timezone)))))
      ;; if we have a report timezone we want to generate SQL like convert_tz('2004-01-01T12:00:00','-8:00','-2:00')
      ;; to convert our timestamp from the UTC timezone -> report timezone. Note `date-object-literal` is assumed to be
      ;; in UTC as `du/format-date` is being used which defaults to UTC.
      ;; See https://dev.mysql.com/doc/refman/5.7/en/date-and-time-functions.html#function_convert-tz
      ;; (We're using raw offsets for the JVM/report timezone instead of the timezone ID because we can't be 100% sure that
      ;; MySQL will accept either of our timezone IDs as valid.)
      ;;
      ;; Note there's a small chance that report timezone will never be set on the MySQL connection, if attempting to
      ;; do so fails because the ID is valid; if the report timezone is different from the MySQL database's timezone,
      ;; this will result in the `convert_tz()` call below being incorrect. Unfortunately we don't currently have a
      ;; way to determine that setting a timezone has failed for the current query, since it actualy is attempted
      ;; after the query is compiled. Hopefully situtations where that happens are rare; at any rate it's probably
      ;; preferable to have timezones slightly wrong in these rare theoretical situations, instead of all the time, as
      ;; was the previous behavior.
      (hsql/call :convert_tz
        date-literal-or-string
        utc-hsql-offset
        (hx/literal report-timezone-offset-str))
      ;; otherwise if we don't have a report timezone we can continue to pass the object as-is, e.g. as a prepared
      ;; statement param
      date-obj)))

;; MySQL doesn't seem to correctly want to handle timestamps no matter how nicely we ask. SAD! Thus we will just
;; convert them to appropriate timestamp literals and include functions to convert timezones as needed
(defmethod sql.qp/->honeysql [:mysql Date]
  [_ date]
  (create-hsql-for-date date (hx/literal (du/format-date :date-hour-minute-second-ms date))))

;; The sql.qp/->honeysql entrypoint is used by MBQL, but native queries with field filters have the same issue. Below
;; will return a map that will be used in the prepared statement to correctly convert and parameterize the date
(s/defmethod sql/->prepared-substitution [:mysql Date] :- sql/PreparedStatementSubstitution
  [_ date]
  (let [date-str (du/format-date :date-hour-minute-second-ms date)]
    (sql/make-stmt-subs (-> (create-hsql-for-date date date-str)
                            hx/->date
                            (hsql/format :quoting :mysql, :allow-dashed-names? true)
                            first)
                        [date-str])))

(defmethod sql.qp/->honeysql [:mysql Time]
  [_ time-value]
  (hx/->time time-value))


;; Since MySQL doesn't have date_trunc() we fake it by formatting a date to an appropriate string and then converting
;; back to a date. See http://dev.mysql.com/doc/refman/5.6/en/date-and-time-functions.html#function_date-format for an
;; explanation of format specifiers
(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))


(defmethod sql.qp/date [:mysql :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:mysql :minute]          [_ _ expr] (trunc-with-format "%Y-%m-%d %H:%i" expr))
(defmethod sql.qp/date [:mysql :minute-of-hour]  [_ _ expr] (hx/minute expr))
(defmethod sql.qp/date [:mysql :hour]            [_ _ expr] (trunc-with-format "%Y-%m-%d %H" expr))
(defmethod sql.qp/date [:mysql :hour-of-day]     [_ _ expr] (hx/hour expr))
(defmethod sql.qp/date [:mysql :day]             [_ _ expr] (hsql/call :date expr))
(defmethod sql.qp/date [:mysql :day-of-week]     [_ _ expr] (hsql/call :dayofweek expr))
(defmethod sql.qp/date [:mysql :day-of-month]    [_ _ expr] (hsql/call :dayofmonth expr))
(defmethod sql.qp/date [:mysql :day-of-year]     [_ _ expr] (hsql/call :dayofyear expr))
(defmethod sql.qp/date [:mysql :month-of-year]   [_ _ expr] (hx/month expr))
(defmethod sql.qp/date [:mysql :quarter-of-year] [_ _ expr] (hx/quarter expr))
(defmethod sql.qp/date [:mysql :year]            [_ _ expr] (hx/year expr))

;; To convert a YEARWEEK (e.g. 201530) back to a date you need tell MySQL which day of the week to use,
;; because otherwise as far as MySQL is concerned you could be talking about any of the days in that week
(defmethod sql.qp/date [:mysql :week] [_ _ expr]
  (str-to-date "%X%V %W"
               (hx/concat (hsql/call :yearweek expr)
                          (hx/literal " Sunday"))))

;; mode 6: Sunday is first day of week, first week of year is the first one with 4+ days
(defmethod sql.qp/date [:mysql :week-of-year] [_ _ expr]
  (hx/inc (hx/week expr 6)))

(defmethod sql.qp/date [:mysql :month] [_ _ expr]
  (str-to-date "%Y-%m-%d"
               (hx/concat (date-format "%Y-%m" expr)
                          (hx/literal "-01"))))

;; Truncating to a quarter is trickier since there aren't any format strings.
;; See the explanation in the H2 driver, which does the same thing but with slightly different syntax.
(defmethod sql.qp/date [:mysql :quarter] [_ _ expr]
  (str-to-date "%Y-%m-%d"
               (hx/concat (hx/year expr)
                          (hx/literal "-")
                          (hx/- (hx/* (hx/quarter expr)
                                      3)
                                2)
                          (hx/literal "-01"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.sync/database-type->base-type :mysql [_ database-type]
  ({:BIGINT     :type/BigInteger
    :BINARY     :type/*
    :BIT        :type/Boolean
    :BLOB       :type/*
    :CHAR       :type/Text
    :DATE       :type/Date
    :DATETIME   :type/DateTime
    :DECIMAL    :type/Decimal
    :DOUBLE     :type/Float
    :ENUM       :type/*
    :FLOAT      :type/Float
    :INT        :type/Integer
    :INTEGER    :type/Integer
    :LONGBLOB   :type/*
    :LONGTEXT   :type/Text
    :MEDIUMBLOB :type/*
    :MEDIUMINT  :type/Integer
    :MEDIUMTEXT :type/Text
    :NUMERIC    :type/Decimal
    :REAL       :type/Float
    :SET        :type/*
    :SMALLINT   :type/Integer
    :TEXT       :type/Text
    :TIME       :type/Time
    :TIMESTAMP  :type/DateTime
    :TINYBLOB   :type/*
    :TINYINT    :type/Integer
    :TINYTEXT   :type/Text
    :VARBINARY  :type/*
    :VARCHAR    :type/Text
    :YEAR       :type/Integer}
   ;; strip off " UNSIGNED" from end if present
   (keyword (str/replace (name database-type) #"\sUNSIGNED$" ""))))


(def ^:private default-connection-args
  "Map of args for the MySQL JDBC connection string.
   Full list of is options is available here: http://dev.mysql.com/doc/connector-j/6.0/en/connector-j-reference-configuration-properties.html"
  { ;; 0000-00-00 dates are valid in MySQL; convert these to `null` when they come back because they're illegal in Java
   :zeroDateTimeBehavior          :convertToNull
   ;; Force UTF-8 encoding of results
   :useUnicode                    :true
   :characterEncoding             :UTF8
   :characterSetResults           :UTF8
   ;; Needs to be true to set useJDBCCompliantTimezoneShift to true
   :useLegacyDatetimeCode         :true
   ;; This allows us to adjust the timezone of timestamps as we pull them from the resultset
   :useJDBCCompliantTimezoneShift :true})

(def ^:private ^:const ^String default-connection-args-string
  (str/join \& (for [[k v] default-connection-args]
                 (str (name k) \= (name v)))))

(defn- append-connection-args
  "Append `default-connection-args-string` to the connection string in CONNECTION-DETAILS, and an additional option to
  explicitly disable SSL if appropriate. (Newer versions of MySQL will complain if you don't explicitly disable SSL.)"
  {:argslist '([connection-spec details])}
  [connection-spec {ssl? :ssl}]
  (update connection-spec :subname
          (fn [subname]
            (let [join-char (if (str/includes? subname "?") "&" "?")]
              (str subname join-char default-connection-args-string (when-not ssl?
                                                                      "&useSSL=false"))))))

(defmethod sql-jdbc.conn/connection-details->spec :mysql [_ details]
  (-> details
      (set/rename-keys {:dbname :db})
      dbspec/mysql
      (append-connection-args details)
      (sql-jdbc.common/handle-additional-options details)))


(defmethod sql-jdbc.sync/active-tables :mysql [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))


(defmethod sql-jdbc.sync/excluded-schemas :mysql [_]
  #{"INFORMATION_SCHEMA"})

(defmethod sql.qp/quote-style :mysql [_] :mysql)

;; If this fails you need to load the timezone definitions from your system into MySQL; run the command
;;
;;    `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
;;
;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
;;
;; TODO - This can also be set via `sessionVariables` in the connection string, if that's more useful (?)
(defmethod sql-jdbc.execute/set-timezone-sql :mysql [_]
  "SET @@session.time_zone = %s;")
