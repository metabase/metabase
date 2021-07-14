(ns metabase.driver.sqlserver
  "Driver for SQLServer databases. Uses the official Microsoft JDBC driver under the hood (pre-0.25.0, used jTDS)."
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [honeysql.helpers :as h]
            [java-time :as t]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql :as sql]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.sql.util.unprepare :as unprepare]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.interface :as qp.i]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [trs]])
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

(defmethod driver/db-start-of-week :sqlserver
  [_]
  :sunday)

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
  (-> {:applicationName    config/mb-version-and-process-identifier
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
  (hx/maybe-cast :smalldatetime expr))

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
  ;; `::optimized-bucketing?` is added by `optimized-temporal-buckets`; this signifies that we can use more efficient
  ;; SQL functions like `day()` that don't return a full DATE. See `optimized-temporal-buckets` below for more info.
  (if (::optimized-bucketing? sql.qp/*field-options*)
    (hx/day expr)
    (hsql/call :DateFromParts (hx/year expr) (hx/month expr) (hx/day expr))))

(defmethod sql.qp/date [:sqlserver :day-of-week]
  [_ _ expr]
  (sql.qp/adjust-day-of-week :sqlserver (date-part :weekday expr)))

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
             (hx/- 1 (date-part :weekday expr) (driver.common/start-of-week-offset :sqlserver))
             (hx/->date expr))))

(defmethod sql.qp/date [:sqlserver :month]
  [_ _ expr]
  (if (::optimized-bucketing? sql.qp/*field-options*)
    (hx/month expr)
    (hsql/call :DateFromParts (hx/year expr) (hx/month expr) 1)))

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
            (hsql/call :DateFromParts (hx/year expr) 1 1)))

(defmethod sql.qp/date [:sqlserver :quarter-of-year]
  [_ _ expr]
  (date-part :quarter expr))

(defmethod sql.qp/date [:sqlserver :year]
  [_ _ expr]
  (if (::optimized-bucketing? sql.qp/*field-options*)
    (hx/year expr)
    (hsql/call :DateFromParts (hx/year expr) 1 1)))

(defmethod sql.qp/add-interval-honeysql-form :sqlserver
  [_ hsql-form amount unit]
  (date-add unit amount hsql-form))

(defmethod sql.qp/unix-timestamp->honeysql [:sqlserver :seconds]
  [_ _ expr]
  ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
  ;; integer overflow errors (especially for millisecond timestamps).
  ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
  (date-add :minute (hx// expr 60) (hx/literal "1970-01-01")))

(defmethod sql.qp/cast-temporal-string [:sqlserver :Coercion/ISO8601->DateTime]
  [_driver _semantic_type expr]
  (hx/->datetime expr))

(defmethod sql.qp/cast-temporal-string [:sqlserver :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _semantic_type expr]
  ;; "20190421164300" -> "2019-04-21 16:43:00"
  ;;                          5  8  11 14 17
  (let [formatted (reduce (fn [expr [index c]]
                            (hsql/call :stuff expr index 0 c))
                          expr
                          [[5 "-"]
                           [8 "-"]
                           [11 " "]
                           [14 ":"]
                           [17 ":"]])]
    ;; 20 is ODBC canonical yyyy-mm-dd hh:mi:ss (24h). I couldn't find a way to use an arbitrary format string when
    ;; parsing and SO seems to push towards manually formatting a string and then parsing with one of the available
    ;; formats. Not great.
    (hsql/call :convert (hsql/raw "datetime2") formatted 20)))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :limit]
  [_ _ honeysql-form {value :limit}]
  (assoc honeysql-form :modifiers [(format "TOP %d" value)]))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :page]
  [_ _ honeysql-form {{:keys [items page]} :page}]
  (assoc honeysql-form :offset (hsql/raw (format "%d ROWS FETCH NEXT %d ROWS ONLY"
                                                 (* items (dec page))
                                                 items))))

(defn- optimized-temporal-buckets
  "If `field-clause` is being truncated temporally to `:year`, `:month`, or `:day`, return a optimized set of
  replacement `:field` clauses that we can use to generate more efficient SQL. Otherwise returns `nil`.

    (optimized-temporal-buckets [:field 1 {:temporal-unit :month])
    ;; ->
    [[:field 1 {:temporal-unit :year, ::optimized-bucketing? true}]
     [:field 1 {:temporal-unit :month, ::optimized-bucketing? true}]]

  How is this used? Without optimization, we used to generate SQL like

    SELECT DateFromParts(year(field), month(field), 1), count(*)
    FROM table
    GROUP BY DateFromParts(year(field), month(field), 1)
    ORDER BY DateFromParts(year(field), month(field), 1) ASC

  The optimized SQL we generate instead looks like

    SELECT DateFromParts(year(field), month(field), 1), count(*)
    FROM table
    GROUP BY year(field), month(field)
    ORDER BY year(field) ASC, month(field) ASC

  The `year`, `month`, and `day` can make use of indexes whereas `DateFromParts` cannot. The optimized version of the
  query is much more efficient. See #9934 for more details."
  [field-clause]
  (when (mbql.u/is-clause? :field field-clause)
    (let [[_ id-or-name {:keys [temporal-unit], :as opts}] field-clause]
      (when (#{:year :month :day} temporal-unit)
        (mapv
         (fn [unit]
           [:field id-or-name (assoc opts :temporal-unit unit, ::optimized-bucketing? true)])
         (case temporal-unit
           :year  [:year]
           :month [:year :month]
           :day   [:year :month :day]))))))

(defn- optimize-breakout-clauses
  "Optimize `breakout-clauses` using `optimized-temporal-buckets`, if possible."
  [breakout-clauses]
  (vec
   (mapcat
    (fn [breakout]
      (or (optimized-temporal-buckets breakout)
          [breakout]))
    breakout-clauses)))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :breakout]
  [driver _ honeysql-form {breakout-fields :breakout, fields-fields :fields :as query}]
  ;; this is basically the same implementation as the default one in the `sql.qp` namespace, the only difference is
  ;; that we optimize the fields in the GROUP BY clause using `optimize-breakout-clauses`.
  (let [optimized      (optimize-breakout-clauses breakout-fields)
        unique-name-fn (mbql.u/unique-name-generator)]
    (as-> honeysql-form new-hsql
      ;; we can still use the "unoptimized" version of the breakout for the SELECT... e.g.
      ;;
      ;;    SELECT DateFromParts(year(field), month(field), 1)
      (apply h/merge-select new-hsql (->> breakout-fields
                                          (remove (set fields-fields))
                                          (mapv (fn [field-clause]
                                                  (sql.qp/as driver field-clause unique-name-fn)))))
      ;; For the GROUP BY, we replace the unoptimized fields with the optimized ones, e.g.
      ;;
      ;;    GROUP BY year(field), month(field)
      (apply h/group new-hsql (mapv (partial sql.qp/->honeysql driver) optimized)))))

(defn- optimize-order-by-subclauses
  "Optimize `:order-by` `subclauses` using `optimized-temporal-buckets`, if possible."
  [subclauses]
  (vec
   (mapcat
    (fn [[direction field :as subclause]]
      (if-let [optimized (optimized-temporal-buckets field)]
        (for [optimized-clause optimized]
          [direction optimized-clause])
        [subclause]))
    subclauses)))

;; From the dox:
;;
;; The ORDER BY clause is invalid in views, inline functions, derived tables, subqueries, and common table
;; expressions, unless TOP, OFFSET or FOR XML is also specified.
;;
;; To fix this we'll add a max-results LIMIT to the query when we add the order-by if there's no `limit` specified,
;; but not for `top-level` queries (since it's not needed there)
(defmethod sql.qp/apply-top-level-clause [:sqlserver :order-by]
  [driver _ honeysql-form {:keys [limit], :as query}]
  ;; similar to the way we optimize GROUP BY above, optimize temporal bucketing in the ORDER BY if possible, because
  ;; year(), month(), and day() can make use of indexes while DateFromParts() cannot.
  (let [query         (update query :order-by optimize-order-by-subclauses)
        add-limit?    (and (not limit) (pos? sql.qp/*nested-query-level*))
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

;; SQL server only supports setting holdability at the connection level, not the statement level, as per
;; https://docs.microsoft.com/en-us/sql/connect/jdbc/using-holdability?view=sql-server-ver15
;; and
;; https://github.com/microsoft/mssql-jdbc/blob/v9.2.1/src/main/java/com/microsoft/sqlserver/jdbc/SQLServerConnection.java#L5349-L5357
;; an exception is thrown if they do not match, so it's safer to simply NOT try to override it at the statement level,
;; because it's not supported anyway
(defmethod sql-jdbc.execute/prepared-statement :sqlserver
  [driver ^Connection conn ^String sql params]
  (let [stmt (.prepareStatement conn
                                sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY)]
    (try
      (try
        (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
        (catch Throwable e
          (log/debug e (trs "Error setting prepared statement fetch direction to FETCH_FORWARD"))))
      (sql-jdbc.execute/set-parameters! driver stmt params)
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))

;; similar rationale to prepared-statement above
(defmethod sql-jdbc.execute/statement :sqlserver
  [_ ^Connection conn]
  (let [stmt (.createStatement conn
                               ResultSet/TYPE_FORWARD_ONLY
                               ResultSet/CONCUR_READ_ONLY)]
    (try
      (try
        (.setFetchDirection stmt ResultSet/FETCH_FORWARD)
        (catch Throwable e
          (log/debug e (trs "Error setting statement fetch direction to FETCH_FORWARD"))))
      stmt
      (catch Throwable e
        (.close stmt)
        (throw e)))))
