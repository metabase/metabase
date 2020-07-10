(ns metabase.driver.sqlserver
  "Driver for SQLServer databases. Uses the official Microsoft JDBC driver under the hood (pre-0.25.0, used jTDS)."
  (:require [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver
             [common :as driver.common]
             [sql :as sql]]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.query-processor.interface :as qp.i]
            [metabase.util.honeysql-extensions :as hx])
  (:import [java.sql Connection ResultSet Time Types]
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           java.util.Date))

(driver/register! :sqlserver, :parent :sql-jdbc)

(defmethod driver/supports? [:sqlserver :regex] [_ _] false)
(defmethod driver/supports? [:sqlserver :percentile-aggregations] [_ _] false)
;; SQLServer LIKE clauses are case-sensitive or not based on whether the collation of the server and the columns
;; themselves. Since this isn't something we can really change in the query itself don't present the option to the
;; users in the UI
(defmethod driver/supports? [:sqlserver :case-sensitivity-string-filter-options] [_ _] false)

;; See the list here: https://docs.microsoft.com/en-us/sql/connect/jdbc/using-basic-data-types
(defmethod sql-jdbc.sync/database-type->base-type :sqlserver
  [_ column-type]
  ({:bigint           :type/BigInteger
    :binary           :type/*
    :bit              :type/Boolean ; actually this is 1 / 0 instead of true / false ...
    :char             :type/Text
    :cursor           :type/*
    :date             :type/Date
    :datetime         :type/DateTime
    :datetime2        :type/DateTime
    :datetimeoffset   :type/DateTimeWithZoneOffset
    :decimal          :type/Decimal
    :float            :type/Float
    :geography        :type/*
    :geometry         :type/*
    :hierarchyid      :type/*
    :image            :type/*
    :int              :type/Integer
    :money            :type/Decimal
    :nchar            :type/Text
    :ntext            :type/Text
    :numeric          :type/Decimal
    :nvarchar         :type/Text
    :real             :type/Float
    :smalldatetime    :type/DateTime
    :smallint         :type/Integer
    :smallmoney       :type/Decimal
    :sql_variant      :type/*
    :table            :type/*
    :text             :type/Text
    :time             :type/Time
    :timestamp        :type/* ; not a standard SQL timestamp, see https://msdn.microsoft.com/en-us/library/ms182776.aspx
    :tinyint          :type/Integer
    :uniqueidentifier :type/UUID
    :varbinary        :type/*
    :varchar          :type/Text
    :xml              :type/*
    (keyword "int identity") :type/Integer} column-type)) ; auto-incrementing integer (ie pk) field


(defmethod sql-jdbc.conn/connection-details->spec :sqlserver
  [_ {:keys [user password db host port instance domain ssl]
      :or   {user "dbuser", password "dbpassword", db "", host "localhost"}
      :as   details}]
  (-> {:applicationName    config/mb-app-id-string
       :subprotocol        "sqlserver"
       ;; it looks like the only thing that actually needs to be passed as the `subname` is the host; everything else
       ;; can be passed as part of the Properties
       :subname            (str "//" host)
       ;; everything else gets passed as `java.util.Properties` to the JDBC connection.  (passing these as Properties
       ;; instead of part of the `:subname` is preferable because they support things like passwords with special
       ;; characters)
       :database           db
       :password           password
       ;; Wait up to 10 seconds for connection success. If we get no response by then, consider the connection failed
       :loginTimeout       10
       ;; apparently specifying `domain` with the official SQLServer driver is done like `user:domain\user` as opposed
       ;; to specifying them seperately as with jTDS see also:
       ;; https://social.technet.microsoft.com/Forums/sqlserver/en-US/bc1373f5-cb40-479d-9770-da1221a0bc95/connecting-to-sql-server-in-a-different-domain-using-jdbc-driver?forum=sqldataaccess
       :user               (str (when domain (str domain "\\"))
                                user)
       :instanceName       instance
       :encrypt            (boolean ssl)
       ;; only crazy people would want this. See https://docs.microsoft.com/en-us/sql/connect/jdbc/configuring-how-java-sql-time-values-are-sent-to-the-server?view=sql-server-ver15
       :sendTimeAsDatetime false}
      ;; only include `port` if it is specified; leave out for dynamic port: see
      ;; https://github.com/metabase/metabase/issues/7597
      (merge (when port {:port port}))
      (sql-jdbc.common/handle-additional-options details, :seperator-style :semicolon)))

;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/datepart-transact-sql?view=sql-server-ver15
(defn- date-part [unit expr]
  (hsql/call :datepart (hsql/raw (name unit)) expr))

(defn- date-add [unit & exprs]
  (apply hsql/call :dateadd (hsql/raw (name unit)) exprs))

;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/date-and-time-data-types-and-functions-transact-sql for
;; details on the functions we're using.

(defmethod sql.qp/date [:sqlserver :default]
  [_ _ expr]
  expr)

(defmethod sql.qp/date [:sqlserver :minute]
  [_ _ expr]
  (hx/cast :smalldatetime expr))

(defmethod sql.qp/date [:sqlserver :minute-of-hour]
  [_ _ expr]
  (date-part :minute expr))

(defmethod sql.qp/date [:sqlserver :hour]
  [_ _ expr]
  (hsql/call :datetime2fromparts (hx/year expr) (hx/month expr) (hx/day expr) (date-part :hour expr) 0 0 0 0))

(defmethod sql.qp/date [:sqlserver :hour-of-day]
  [_ _ expr]
  (date-part :hour expr))

(defmethod sql.qp/date [:sqlserver :day]
  [_ _ expr]
  (hx/->date expr))

(defmethod sql.qp/date [:sqlserver :day-of-week]
  [_ _ expr]
  (date-part :weekday expr))

(defmethod sql.qp/date [:sqlserver :day-of-month]
  [_ _ expr]
  (date-part :day expr))

(defmethod sql.qp/date [:sqlserver :day-of-year]
  [_ _ expr]
  (date-part :dayofyear expr))

;; Subtract the number of days needed to bring us to the first day of the week, then convert to date
;; The equivalent SQL looks like:
;;     CAST(DATEADD(day, 1 - DATEPART(weekday, %s), CAST(%s AS DATE)) AS DATETIME)
(defmethod sql.qp/date [:sqlserver :week]
  [_ _ expr]
  (hx/->datetime
   (date-add :day
             (hx/- 1 (date-part :weekday expr))
             (hx/->date expr))))

(defmethod sql.qp/date [:sqlserver :week-of-year]
  [_ _ expr]
  (date-part :iso_week expr))

(defmethod sql.qp/date [:sqlserver :month]
  [_ _ expr]
  (hsql/call :datefromparts (hx/year expr) (hx/month expr) 1))

(defmethod sql.qp/date [:sqlserver :month-of-year]
  [_ _ expr]
  (date-part :month expr))

;; Format date as yyyy-01-01 then add the appropriate number of quarter
;; Equivalent SQL:
;;     DATEADD(quarter, DATEPART(quarter, %s) - 1, FORMAT(%s, 'yyyy-01-01'))
(defmethod sql.qp/date [:sqlserver :quarter]
  [_ _ expr]
  (date-add :quarter
            (hx/dec (date-part :quarter expr))
            (hsql/call :datefromparts (hx/year expr) 1 1)))

(defmethod sql.qp/date [:sqlserver :quarter-of-year]
  [_ _ expr]
  (date-part :quarter expr))

(defmethod sql.qp/date [:sqlserver :year]
  [_ _ expr]
  (hsql/call :datefromparts (hx/year expr) 1 1))

(defmethod sql.qp/add-interval-honeysql-form :sqlserver
  [_ hsql-form amount unit]
  (date-add unit amount hsql-form))

(defmethod sql.qp/unix-timestamp->honeysql [:sqlserver :seconds]
  [_ _ expr]
  ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
  ;; integer overflow errors (especially for millisecond timestamps).
  ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
  (date-add :minute (hx// expr 60) (hx/literal "1970-01-01")))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :limit]
  [_ _ honeysql-form {value :limit}]
  (assoc honeysql-form :modifiers [(format "TOP %d" value)]))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :page]
  [_ _ honeysql-form {{:keys [items page]} :page}]
  (assoc honeysql-form :offset (hsql/raw (format "%d ROWS FETCH NEXT %d ROWS ONLY"
                                                 (* items (dec page))
                                                 items))))

;; From the dox:
;;
;; The ORDER BY clause is invalid in views, inline functions, derived tables, subqueries, and common table
;; expressions, unless TOP, OFFSET or FOR XML is also specified.
;;
;; To fix this we'll add a max-results LIMIT to the query when we add the order-by if there's no `limit` specified,
;; but not for `top-level` queries (since it's not needed there)
(defmethod sql.qp/apply-top-level-clause [:sqlserver :order-by]
  [driver _ honeysql-form {:keys [limit], :as query}]
  (let [add-limit?    (and (not limit) (pos? sql.qp/*nested-query-level*))
        honeysql-form ((get-method sql.qp/apply-top-level-clause [:sql-jdbc :order-by])
                       driver :order-by honeysql-form query)]
    (if-not add-limit?
      honeysql-form
      (sql.qp/apply-top-level-clause driver :limit honeysql-form (assoc query :limit qp.i/absolute-max-results)))))

;; SQLServer doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sql.qp/->honeysql [:sqlserver Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sql.qp/->honeysql [:sqlserver Time]
  [_ time-value]
  (hx/->time time-value))

(defmethod sql.qp/->honeysql [:sqlserver :stddev]
  [driver [_ field]]
  (hsql/call :stdevp (sql.qp/->honeysql driver field)))

(defmethod sql.qp/->honeysql [:sqlserver :var]
  [driver [_ field]]
  (hsql/call :varp (sql.qp/->honeysql driver field)))

(defmethod sql.qp/->honeysql [:sqlserver :substring]
  [driver [_ arg start length]]
  (if length
    (hsql/call :substring (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (sql.qp/->honeysql driver length))
    (hsql/call :substring (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (hsql/call :len (sql.qp/->honeysql driver arg)))))

(defmethod sql.qp/->honeysql [:sqlserver :length]
  [driver [_ arg]]
  (hsql/call :len (sql.qp/->honeysql driver arg)))

(defmethod sql.qp/->honeysql [:sqlserver :ceil]
  [driver [_ arg]]
  (hsql/call :ceiling (sql.qp/->honeysql driver arg)))

(defmethod sql.qp/->honeysql [:sqlserver :round]
  [driver [_ arg]]
  (hsql/call :round (hx/cast :float (sql.qp/->honeysql driver arg)) 0))

(defmethod sql.qp/->honeysql [:sqlserver :power]
  [driver [_ arg power]]
  (hsql/call :power (hx/cast :float (sql.qp/->honeysql driver arg)) (sql.qp/->honeysql driver power)))

(defmethod sql.qp/->honeysql [:sqlserver :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(defmethod driver.common/current-db-time-date-formatters :sqlserver
  [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSZ"))

(defmethod driver.common/current-db-time-native-query :sqlserver
  [_]
  "select CONVERT(nvarchar(30), SYSDATETIMEOFFSET(), 127)")

(defmethod driver/current-db-time :sqlserver
  [& args]
  (apply driver.common/current-db-time args))

(defmethod sql.qp/current-datetime-honeysql-form :sqlserver [_] :%getdate)

(defmethod sql-jdbc.sync/excluded-schemas :sqlserver
  [_]
  #{"sys" "INFORMATION_SCHEMA"})

;; SQL Server doesn't support setting the holdability of an individual result set, otherwise this impl is basically
;; the same as the default
(defmethod sql-jdbc.execute/prepared-statement :sqlserver
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

(defmethod unprepare/unprepare-value [:sqlserver LocalDate]
  [_ ^LocalDate t]
  ;; datefromparts(year, month, day)
  ;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/datefromparts-transact-sql?view=sql-server-ver15
  (format "DateFromParts(%d, %d, %d)" (.getYear t) (.getMonthValue t) (.getDayOfMonth t)))

(defmethod unprepare/unprepare-value [:sqlserver LocalTime]
  [_ ^LocalTime t]
  ;; timefromparts(hour, minute, seconds, fraction, precision)
  ;; See https://docs.microsoft.com/en-us/sql/t-sql/functions/timefromparts-transact-sql?view=sql-server-ver15
  ;; precision = 7 which means the fraction is 100 nanoseconds, smallest supported by SQL Server
  (format "TimeFromParts(%d, %d, %d, %d, 7)" (.getHour t) (.getMinute t) (.getSecond t) (long (/ (.getNano t) 100))))

(defmethod unprepare/unprepare-value [:sqlserver OffsetTime]
  [driver t]
  (unprepare/unprepare-value driver (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

(defmethod unprepare/unprepare-value [:sqlserver OffsetDateTime]
  [_ ^OffsetDateTime t]
  ;; DateTimeOffsetFromParts(year, month, day, hour, minute, seconds, fractions, hour_offset, minute_offset, precision)
  (let [offset-minutes (long (/ (.getTotalSeconds (.getOffset t)) 60))
        hour-offset    (long (/ offset-minutes 60))
        minute-offset  (mod offset-minutes 60)]
    (format "DateTimeOffsetFromParts(%d, %d, %d, %d, %d, %d, %d, %d, %d, 7)"
            (.getYear t) (.getMonthValue t) (.getDayOfMonth t)
            (.getHour t) (.getMinute t) (.getSecond t) (long (/ (.getNano t) 100))
            hour-offset minute-offset)))

(defmethod unprepare/unprepare-value [:sqlserver ZonedDateTime]
  [driver t]
  (unprepare/unprepare-value driver (t/offset-date-time t)))

(defmethod unprepare/unprepare-value [:sqlserver LocalDateTime]
  [_ ^LocalDateTime t]
  ;; DateTime2FromParts(year, month, day, hour, minute, seconds, fractions, precision)
  (format "DateTime2FromParts(%d, %d, %d, %d, %d, %d, %d, 7)"
          (.getYear t) (.getMonthValue t) (.getDayOfMonth t)
          (.getHour t) (.getMinute t) (.getSecond t) (long (/ (.getNano t) 100))))

;; SQL Server doesn't support TIME WITH TIME ZONE so convert OffsetTimes to LocalTimes in UTC. Otherwise SQL Server
;; will try to convert it to a `DATETIMEOFFSET` which of course is not comparable to `TIME` columns
;;
;; TIMEZONE FIXME — does it make sense to convert this to UTC? Shouldn't we convert it to the report timezone? Figure
;; this mystery out
(defmethod sql-jdbc.execute/set-parameter [:sqlserver OffsetTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

;; instead of default `microsoft.sql.DateTimeOffset`
(defmethod sql-jdbc.execute/read-column-thunk [:sqlserver microsoft.sql.Types/DATETIMEOFFSET]
  [_^ResultSet rs _ ^Integer i]
  (fn []
    (.getObject rs i OffsetDateTime)))

;; SQL Server doesn't really support boolean types so use bits instead (#11592)
(defmethod sql/->prepared-substitution [:sqlserver Boolean]
  [driver bool]
  (sql/->prepared-substitution driver (if bool 1 0)))
