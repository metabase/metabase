(ns metabase.driver.sqlserver
  "Driver for SQLServer databases. Uses the official Microsoft JDBC driver under the hood (pre-0.25.0, used jTDS)."
  (:require [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]]
            [metabase.driver.common :as driver.common]
            [metabase.driver.sql-jdbc
             [common :as sql-jdbc.common]
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.util.honeysql-extensions :as hx])
  (:import java.sql.Time))

(driver/register! :sqlserver, :parent :sql-jdbc)

;; See the list here: https://docs.microsoft.com/en-us/sql/connect/jdbc/using-basic-data-types
(defmethod sql-jdbc.sync/database-type->base-type :sqlserver [_ column-type]
  ({:bigint           :type/BigInteger
    :binary           :type/*
    :bit              :type/Boolean ; actually this is 1 / 0 instead of true / false ...
    :char             :type/Text
    :cursor           :type/*
    :date             :type/Date
    :datetime         :type/DateTime
    :datetime2        :type/DateTime
    :datetimeoffset   :type/DateTime
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
  (-> {:applicationName config/mb-app-id-string
       :subprotocol     "sqlserver"
       ;; it looks like the only thing that actually needs to be passed as the `subname` is the host; everything else
       ;; can be passed as part of the Properties
       :subname         (str "//" host)
       ;; everything else gets passed as `java.util.Properties` to the JDBC connection.  (passing these as Properties
       ;; instead of part of the `:subname` is preferable because they support things like passwords with special
       ;; characters)
       :database        db
       :password        password
       ;; Wait up to 10 seconds for connection success. If we get no response by then, consider the connection failed
       :loginTimeout    10
       ;; apparently specifying `domain` with the official SQLServer driver is done like `user:domain\user` as opposed
       ;; to specifying them seperately as with jTDS see also:
       ;; https://social.technet.microsoft.com/Forums/sqlserver/en-US/bc1373f5-cb40-479d-9770-da1221a0bc95/connecting-to-sql-server-in-a-different-domain-using-jdbc-driver?forum=sqldataaccess
       :user            (str (when domain (str domain "\\"))
                             user)
       :instanceName    instance
       :encrypt         (boolean ssl)}
      ;; only include `port` if it is specified; leave out for dynamic port: see
      ;; https://github.com/metabase/metabase/issues/7597
      (merge (when port {:port port}))
      (sql-jdbc.common/handle-additional-options details, :seperator-style :semicolon)))


(defn- date-part [unit expr]
  (hsql/call :datepart (hsql/raw (name unit)) expr))

(defn- date-add [unit & exprs]
  (apply hsql/call :dateadd (hsql/raw (name unit)) exprs))

;; See [this page](https://msdn.microsoft.com/en-us/library/ms187752.aspx) for details on the functions we're using.

(defmethod sql.qp/date [:sqlserver :default]         [_ _ expr] expr)
(defmethod sql.qp/date [:sqlserver :minute]          [_ _ expr] (hx/cast :smalldatetime expr))
(defmethod sql.qp/date [:sqlserver :minute-of-hour]  [_ _ expr] (date-part :minute expr))
(defmethod sql.qp/date [:sqlserver :hour]            [_ _ expr] (hx/->datetime (hx/format "yyyy-MM-dd HH:00:00" expr)))
(defmethod sql.qp/date [:sqlserver :hour-of-day]     [_ _ expr] (date-part :hour expr))
(defmethod sql.qp/date [:sqlserver :day-of-week]     [_ _ expr] (date-part :weekday expr))
(defmethod sql.qp/date [:sqlserver :day-of-month]    [_ _ expr] (date-part :day expr))
(defmethod sql.qp/date [:sqlserver :day-of-year]     [_ _ expr] (date-part :dayofyear expr))
(defmethod sql.qp/date [:sqlserver :week-of-year]    [_ _ expr] (date-part :iso_week expr))
(defmethod sql.qp/date [:sqlserver :month]           [_ _ expr] (hx/->datetime (hx/format "yyyy-MM-01" expr)))
(defmethod sql.qp/date [:sqlserver :month-of-year]   [_ _ expr] (date-part :month expr))
(defmethod sql.qp/date [:sqlserver :quarter-of-year] [_ _ expr] (date-part :quarter expr))
(defmethod sql.qp/date [:sqlserver :year]            [_ _ expr] (date-part :year expr))

;; jTDS is wack; I sense an ongoing theme here. It returns DATEs as strings instead of as java.sql.Dates like every
;; other SQL DB we support. Work around that by casting to DATE for truncation then back to DATETIME so we get the
;; type we want.
;;
;; TODO - I'm not sure we still need to do this now that we're using the official Microsoft JDBC driver. Maybe we can
;; simplify this now?
(defmethod sql.qp/date [:sqlserver :day] [_ _ expr]
  (hx/->datetime (hx/->date expr)))

;; Subtract the number of days needed to bring us to the first day of the week, then convert to date
;; The equivalent SQL looks like:
;;     CAST(DATEADD(day, 1 - DATEPART(weekday, %s), CAST(%s AS DATE)) AS DATETIME)
(defmethod sql.qp/date [:sqlserver :week] [_ _ expr]
  (hx/->datetime
   (date-add :day
             (hx/- 1 (date-part :weekday expr))
             (hx/->date expr))))

;; Format date as yyyy-01-01 then add the appropriate number of quarter
;; Equivalent SQL:
;;     DATEADD(quarter, DATEPART(quarter, %s) - 1, FORMAT(%s, 'yyyy-01-01'))
(defmethod sql.qp/date [:sqlserver :quarter] [_ _ expr]
  (date-add :quarter
            (hx/dec (date-part :quarter expr))
            (hx/format "yyyy-01-01" expr)))

(defmethod driver/date-interval :sqlserver [_ unit amount]
  (date-add unit amount :%getutcdate))

(defmethod sql.qp/unix-timestamp->timestamp [:sqlserver :seconds] [_ _ expr]
  ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
  ;; integer overflow errors (especially for millisecond timestamps).
  ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
  (date-add :minute (hx// expr 60) (hx/literal "1970-01-01")))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :limit] [_ _ honeysql-form {value :limit}]
  (assoc honeysql-form :modifiers [(format "TOP %d" value)]))

(defmethod sql.qp/apply-top-level-clause [:sqlserver :page] [_ _ honeysql-form {{:keys [items page]} :page}]
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
(defmethod sql.qp/apply-top-level-clause [:sqlserver :order-by] [driver _ honeysql-form {:keys [limit], :as query}]
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
  (hsql/call :stdev (sql.qp/->honeysql driver field)))

(defmethod driver.common/current-db-time-date-formatters :sqlserver [_]
  (driver.common/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSZ"))

(defmethod driver.common/current-db-time-native-query :sqlserver [_]
  "select CONVERT(nvarchar(30), SYSDATETIMEOFFSET(), 127)")

(defmethod driver/current-db-time :sqlserver [& args]
  (apply driver.common/current-db-time args))

(defmethod sql.qp/current-datetime-fn :sqlserver [_] :%getutcdate)

;; SQLServer LIKE clauses are case-sensitive or not based on whether the collation of the server and the columns
;; themselves. Since this isn't something we can really change in the query itself don't present the option to the
;; users in the UI
(defmethod driver/supports? [:sqlserver :case-sensitivity-string-filter-options] [_ _] false)

(defmethod sql-jdbc.sync/excluded-schemas :sqlserver [_]
  #{"sys" "INFORMATION_SCHEMA"})
