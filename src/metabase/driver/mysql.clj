(ns metabase.driver.mysql
  "MySQL driver. Builds off of the SQL-JDBC driver."
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.spec :as dbspec]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [trs]]
             [ssh :as ssh]])
  (:import [java.sql DatabaseMetaData ResultSet ResultSetMetaData Types]
           [java.time LocalDateTime OffsetDateTime OffsetTime ZonedDateTime]))

(driver/register! :mysql, :parent :sql-jdbc)

(def ^:private ^:const min-supported-mysql-version 5.7)
(def ^:private ^:const min-supported-mariadb-version 10.2)

(defmethod driver/display-name :mysql [_] "MySQL")

(defmethod driver/supports? [:mysql :regex] [_ _] false)
(defmethod driver/supports? [:mysql :percentile-aggregations] [_ _] false)



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- mariadb? [^DatabaseMetaData metadata]
  (= (.getDatabaseProductName metadata) "MariaDB"))

(defn- db-version [^DatabaseMetaData metadata]
  (Double/parseDouble
   (format "%d.%d" (.getDatabaseMajorVersion metadata) (.getDatabaseMinorVersion metadata))))

(defn- unsupported-version? [^DatabaseMetaData metadata]
  (< (db-version metadata)
     (if (mariadb? metadata) min-supported-mariadb-version min-supported-mysql-version)))

(defn- warn-on-unsupported-versions [driver details]
  (let [jdbc-spec (sql-jdbc.conn/details->connection-spec-for-testing-connection driver details)]
    (jdbc/with-db-metadata [metadata jdbc-spec]
      (when (unsupported-version? metadata)
        (log/warn
         (u/format-color 'red
             (str
              "\n\n********************************************************************************\n"
              (trs "WARNING: Metabase only officially supports MySQL {0}/MariaDB {1} and above."
                   min-supported-mysql-version
                   min-supported-mariadb-version)
              "\n"
              (trs "All Metabase features may not work properly when using an unsupported version.")
              "\n********************************************************************************\n")))))))

(defmethod driver/can-connect? :mysql
  [driver details]
  ;; delegate to parent method to check whether we can connect; if so, check if it's an unsupported version and issue
  ;; a warning if it is
  (when ((get-method driver/can-connect? :sql-jdbc) driver details)
    (warn-on-unsupported-versions driver details)
    true))

(defmethod driver/supports? [:mysql :full-join] [_ _] false)

(defmethod driver/connection-properties :mysql
  [_]
  (ssh/with-tunnel-config
    [driver.common/default-host-details
     (assoc driver.common/default-port-details :placeholder 3306)
     driver.common/default-dbname-details
     driver.common/default-user-details
     driver.common/default-password-details
     driver.common/default-ssl-details
     (assoc driver.common/default-additional-options-details
       :placeholder  "tinyInt1isBit=false")]))

(defmethod sql.qp/add-interval-honeysql-form :mysql
  [driver hsql-form amount unit]
  ;; MySQL doesn't support `:millisecond` as an option, but does support fractional seconds
  (if (= unit :millisecond)
    (recur driver hsql-form (/ amount 1000.0) :second)
    (hsql/call :date_add hsql-form (hsql/raw (format "INTERVAL %s %s" amount (name unit))))))

(defmethod driver/humanize-connection-error-message :mysql
  [_ message]
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

(defmethod driver/db-default-timezone :mysql
  [_ db]
  (let [spec                                   (sql-jdbc.conn/db->pooled-connection-spec db)
        sql                                    (str "SELECT @@GLOBAL.time_zone AS global_tz,"
                                                    " @@system_time_zone AS system_tz,"
                                                    " time_format("
                                                    "   timediff("
                                                    "      now(), convert_tz(now(), @@GLOBAL.time_zone, '+00:00')"
                                                    "   ),"
                                                    "   '%H:%i'"
                                                    " ) AS offset;")
        [{:keys [global_tz system_tz offset]}] (jdbc/query spec sql)
        the-valid-id                           (fn [zone-id]
                                                 (when zone-id
                                                   (try
                                                     (.getId (t/zone-id zone-id))
                                                     (catch Throwable _))))]
    (or
     ;; if global timezone ID is 'SYSTEM', then try to use the system timezone ID
     (when (= global_tz "SYSTEM")
       (the-valid-id system_tz))
     ;; otherwise try to use the global ID
     (the-valid-id global_tz)
     ;; failing that, calculate the offset between now in the global timezone and now in UTC. Non-negative offsets
     ;; don't come back with `+` so add that if needed
     (if (str/starts-with? offset "-")
       offset
       (str \+ offset)))))

;; MySQL LIKE clauses are case-sensitive or not based on whether the collation of the server and the columns
;; themselves. Since this isn't something we can really change in the query itself don't present the option to the
;; users in the UI
(defmethod driver/supports? [:mysql :case-sensitivity-string-filter-options] [_ _] false)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql.qp/unix-timestamp->honeysql [:mysql :seconds] [_ _ expr]
  (hsql/call :from_unixtime expr))

(defn- date-format [format-str expr] (hsql/call :date_format expr (hx/literal format-str)))
(defn- str-to-date [format-str expr] (hsql/call :str_to_date expr (hx/literal format-str)))


(defmethod sql.qp/->float :mysql
  [_ value]
  ;; no-op as MySQL doesn't support cast to float
  value)

(defmethod sql.qp/->honeysql [:mysql :regex-match-first]
  [driver [_ arg pattern]]
  (hsql/call :regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)))

(defmethod sql.qp/->honeysql [:mysql :length]
  [driver [_ arg]]
  (hsql/call :char_length (sql.qp/->honeysql driver arg)))


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
(defmethod sql.qp/date [:mysql :year]            [_ _ expr] (hsql/call :makedate (hx/year expr) 1))

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

(defmethod sql-jdbc.sync/database-type->base-type :mysql
  [_ database-type]
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
    :TIMESTAMP  :type/DateTimeWithLocalTZ ; stored as UTC in the database
    :TINYBLOB   :type/*
    :TINYINT    :type/Integer
    :TINYTEXT   :type/Text
    :VARBINARY  :type/*
    :VARCHAR    :type/Text
    :YEAR       :type/Integer}
   ;; strip off " UNSIGNED" from end if present
   (keyword (str/replace (name database-type) #"\sUNSIGNED$" ""))))

(def ^:private default-connection-args
  "Map of args for the MySQL/MariaDB JDBC connection string."
  { ;; 0000-00-00 dates are valid in MySQL; convert these to `null` when they come back because they're illegal in Java
   :zeroDateTimeBehavior "convertToNull"
   ;; Force UTF-8 encoding of results
   :useUnicode           true
   :characterEncoding    "UTF8"
   :characterSetResults  "UTF8"
   ;; GZIP compress packets sent between Metabase server and MySQL/MariaDB database
   :useCompression       true})

(defmethod sql-jdbc.conn/connection-details->spec :mysql
  [_ {ssl? :ssl, :keys [additional-options], :as details}]
  ;; In versions older than 0.32.0 the MySQL driver did not correctly save `ssl?` connection status. Users worked
  ;; around this by including `useSSL=true`. Check if that's there, and if it is, assume SSL status. See #9629
  ;;
  ;; TODO - should this be fixed by a data migration instead?
  (let [ssl? (or ssl? (some-> additional-options (str/includes? "useSSL=true")))]
    (when (and ssl?
               (not (some->  additional-options (str/includes? "trustServerCertificate"))))
      (log/info (trs "You may need to add 'trustServerCertificate=true' to the additional connection options to connect with SSL.")))
    (merge
     default-connection-args
     ;; newer versions of MySQL will complain if you don't specify this when not using SSL
     {:useSSL (boolean ssl?)}
     (let [details (-> details
                       (set/rename-keys {:dbname :db})
                       (dissoc :ssl))]
       (-> (dbspec/mysql details)
           (sql-jdbc.common/handle-additional-options details))))))

(defmethod sql-jdbc.sync/active-tables :mysql
  [& args]
  (apply sql-jdbc.sync/post-filtered-active-tables args))

(defmethod sql-jdbc.sync/excluded-schemas :mysql
  [_]
  #{"INFORMATION_SCHEMA"})

(defmethod sql.qp/quote-style :mysql [_] :mysql)

;; If this fails you need to load the timezone definitions from your system into MySQL; run the command
;;
;;    `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql`
;;
;; See https://dev.mysql.com/doc/refman/5.7/en/time-zone-support.html for details
;;
(defmethod sql-jdbc.execute/set-timezone-sql :mysql
  [_]
  "SET @@session.time_zone = %s;")

(defmethod sql-jdbc.execute/set-parameter [:mysql OffsetTime]
  [driver ps i t]
  ;; convert to a LocalTime so MySQL doesn't get F U S S Y
  (sql-jdbc.execute/set-parameter driver ps i (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

;; Regardless of session timezone it seems to be the case that OffsetDateTimes get normalized to UTC inside MySQL
;;
;; Since MySQL TIMESTAMPs aren't timezone-aware this means comparisons are done between timestamps in the report
;; timezone and the local datetime portion of the parameter, in UTC. Bad!
;;
;; Convert it to a LocalDateTime, in the report timezone, so comparisions will work correctly.
;;
;; See also — https://dev.mysql.com/doc/refman/5.5/en/datetime.html
;;
;; TIMEZONE FIXME — not 100% sure this behavior makes sense
(defmethod sql-jdbc.execute/set-parameter [:mysql OffsetDateTime]
  [driver ^java.sql.PreparedStatement ps ^Integer i t]
  (let [zone   (t/zone-id (qp.timezone/results-timezone-id))
        offset (.. zone getRules (getOffset (t/instant t)))
        t      (t/local-date-time (t/with-offset-same-instant t offset))]
    (sql-jdbc.execute/set-parameter driver ps i t)))

;; MySQL TIMESTAMPS are actually TIMESTAMP WITH LOCAL TIME ZONE, i.e. they are stored normalized to UTC when stored.
;; However, MySQL returns them in the report time zone in an effort to make our lives horrible.
(defmethod sql-jdbc.execute/read-column-thunk [:mysql Types/TIMESTAMP]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  ;; Check and see if the column type is `TIMESTAMP` (as opposed to `DATETIME`, which is the equivalent of
  ;; LocalDateTime), and normalize it to a UTC timestamp if so.
  (if (= (.getColumnTypeName rsmeta i) "TIMESTAMP")
    (fn read-timestamp-thunk []
      (when-let [t (.getObject rs i LocalDateTime)]
        (t/with-offset-same-instant (t/offset-date-time t (t/zone-id (qp.timezone/results-timezone-id))) (t/zone-offset 0))))
    (fn read-datetime-thunk []
      (.getObject rs i LocalDateTime))))

;; Results of `timediff()` might come back as negative values, or might come back as values that aren't valid
;; `LocalTime`s e.g. `-01:00:00` or `25:00:00`.
;;
;; There is currently no way to tell whether the column is the result of a `timediff()` call (i.e., a duration) or a
;; normal `LocalTime` -- JDBC doesn't have interval/duration type enums. `java.time.LocalTime`only accepts values of
;; hour between 0 and 23 (inclusive). The MariaDB JDBC driver's implementations of `(.getObject rs i
;; java.time.LocalTime)` will throw Exceptions theses cases.
;;
;; Thus we should attempt to fetch temporal results the normal way and fall back to string representations for cases
;; where the values are unparseable.
(defmethod sql-jdbc.execute/read-column-thunk [:mysql Types/TIME]
  [driver ^ResultSet rs rsmeta ^Integer i]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc Types/TIME]) driver rs rsmeta i)]
    (fn read-time-thunk []
      (try
        (parent-thunk)
        (catch Throwable _
          (.getString rs i))))))

(defn- format-offset [t]
  (let [offset (t/format "ZZZZZ" (t/zone-offset t))]
    (if (= offset "Z")
      "UTC"
      offset)))

(defmethod unprepare/unprepare-value [:mysql OffsetTime]
  [_ t]
  ;; MySQL doesn't support timezone offsets in literals so pass in a local time literal wrapped in a call to convert
  ;; it to the appropriate timezone
  (format "convert_tz('%s', '%s', @@session.time_zone)"
          (t/format "HH:mm:ss.SSS" t)
          (format-offset t)))

(defmethod unprepare/unprepare-value [:mysql OffsetDateTime]
  [_ t]
  (format "convert_tz('%s', '%s', @@session.time_zone)"
          (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)
          (format-offset t)))

(defmethod unprepare/unprepare-value [:mysql ZonedDateTime]
  [_ t]
  (format "convert_tz('%s', '%s', @@session.time_zone)"
          (t/format "yyyy-MM-dd HH:mm:ss.SSS" t)
          (str (t/zone-id t))))
