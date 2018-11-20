(ns metabase.driver.sqlserver
  "Driver for SQLServer databases. Uses the official Microsoft JDBC driver under the hood (pre-0.25.0, used jTDS)."
  (:require [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.query-processor.interface :as qp.i]
            [metabase.util
             [honeysql-extensions :as hx]
             [i18n :refer [tru]]
             [ssh :as ssh]])
  (:import java.sql.Time))

(defrecord SQLServerDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "SQL Server"))

(defn- column->base-type
  "Mappings for SQLServer types to Metabase types.
   See the list here: https://docs.microsoft.com/en-us/sql/connect/jdbc/using-basic-data-types"
  [column-type]
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


(defn- connection-details->spec
  "Build the connection spec for a SQL Server database from the DETAILS set in the admin panel.
   Check out the full list of options here: `https://technet.microsoft.com/en-us/library/ms378988(v=sql.105).aspx`"
  [{:keys [user password db host port instance domain ssl]
    :or   {user "dbuser", password "dbpassword", db "", host "localhost"}
    :as   details}]
  (-> {:applicationName config/mb-app-id-string
       :classname       "com.microsoft.sqlserver.jdbc.SQLServerDriver"
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
      (sql/handle-additional-options details, :seperator-style :semicolon)))


(defn- date-part [unit expr]
  (hsql/call :datepart (hsql/raw (name unit)) expr))

(defn- date-add [unit & exprs]
  (apply hsql/call :dateadd (hsql/raw (name unit)) exprs))

(defn- date
  "Wrap a HoneySQL datetime EXPRession in appropriate forms to cast/bucket it as UNIT.
  See [this page](https://msdn.microsoft.com/en-us/library/ms187752.aspx) for details on the functions we're using."
  [unit expr]
  (case unit
    :default         expr
    :minute          (hx/cast :smalldatetime expr)
    :minute-of-hour  (date-part :minute expr)
    :hour            (hx/->datetime (hx/format "yyyy-MM-dd HH:00:00" expr))
    :hour-of-day     (date-part :hour expr)
    ;; jTDS is retarded; I sense an ongoing theme here. It returns DATEs as strings instead of as java.sql.Dates like
    ;; every other SQL DB we support. Work around that by casting to DATE for truncation then back to DATETIME so we
    ;; get the type we want.
    ;; TODO - I'm not sure we still need to do this now that we're using the official Microsoft JDBC driver. Maybe we
    ;; can simplify this now?
    :day             (hx/->datetime (hx/->date expr))
    :day-of-week     (date-part :weekday expr)
    :day-of-month    (date-part :day expr)
    :day-of-year     (date-part :dayofyear expr)
    ;; Subtract the number of days needed to bring us to the first day of the week, then convert to date
    ;; The equivalent SQL looks like:
    ;;     CAST(DATEADD(day, 1 - DATEPART(weekday, %s), CAST(%s AS DATE)) AS DATETIME)
    :week            (hx/->datetime
                      (date-add :day
                                (hx/- 1 (date-part :weekday expr))
                                (hx/->date expr)))
    :week-of-year    (date-part :iso_week expr)
    :month           (hx/->datetime (hx/format "yyyy-MM-01" expr))
    :month-of-year   (date-part :month expr)
    ;; Format date as yyyy-01-01 then add the appropriate number of quarter
    ;; Equivalent SQL:
    ;;     DATEADD(quarter, DATEPART(quarter, %s) - 1, FORMAT(%s, 'yyyy-01-01'))
    :quarter         (date-add :quarter
                               (hx/dec (date-part :quarter expr))
                               (hx/format "yyyy-01-01" expr))
    :quarter-of-year (date-part :quarter expr)
    :year            (date-part :year expr)))

(defn- date-interval [unit amount]
  (date-add unit amount :%getutcdate))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
    ;; integer overflow errors (especially for millisecond timestamps).
    ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
    :seconds      (date-add :minute (hx// expr 60) (hx/literal "1970-01-01"))
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- apply-limit [honeysql-form {value :limit}]
  (assoc honeysql-form :modifiers [(format "TOP %d" value)]))

(defn- apply-page [honeysql-form {{:keys [items page]} :page}]
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
(defn- apply-order-by [default-apply-order-by driver honeysql-form {:keys [limit], :as query}]
  (let [add-limit? (and (not limit) (pos? sqlqp/*nested-query-level*))]
    (cond-> (default-apply-order-by driver honeysql-form query)
      add-limit? (apply-limit (assoc query :limit qp.i/absolute-max-results)))))

;; SQLServer doesn't support `TRUE`/`FALSE`; it uses `1`/`0`, respectively; convert these booleans to numbers.
(defmethod sqlqp/->honeysql [SQLServerDriver Boolean]
  [_ bool]
  (if bool 1 0))

(defmethod sqlqp/->honeysql [SQLServerDriver Time]
  [_ time-value]
  (hx/->time time-value))

(defmethod sqlqp/->honeysql [SQLServerDriver :stddev]
  [driver [_ field]]
  (hsql/call :stdev (sqlqp/->honeysql driver field)))

(defn- string-length-fn [field-key]
  (hsql/call :len (hx/cast :VARCHAR field-key)))


(def ^:private sqlserver-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSZ"))
(def ^:private sqlserver-db-time-query "select CONVERT(nvarchar(30), SYSDATETIMEOFFSET(), 127)")

(u/strict-extend SQLServerDriver
  driver/IDriver
  (merge
   (sql/IDriverSQLDefaultsMixin)
   {:date-interval  (u/drop-first-arg date-interval)
    :details-fields (constantly (ssh/with-tunnel-config
                                  [driver/default-host-details
                                   (assoc driver/default-port-details :placeholder "1433")
                                   (assoc driver/default-dbname-details
                                     :name         "db"
                                     :placeholder  (tru "BirdsOfTheWorld"))
                                   {:name         "instance"
                                    :display-name (tru "Database instance name")
                                    :placeholder  (tru "N/A")}
                                   {:name         "domain"
                                    :display-name (tru "Windows domain")
                                    :placeholder  (tru "N/A")}
                                   driver/default-user-details
                                   driver/default-password-details
                                   driver/default-ssl-details
                                   (assoc driver/default-additional-options-details
                                     :placeholder  "trustServerCertificate=false")]))
    :current-db-time (driver/make-current-db-time-fn sqlserver-db-time-query sqlserver-date-formatters)
    :features        (fn [this]
                       ;; SQLServer LIKE clauses are case-sensitive or not based on whether the collation of the
                       ;; server and the columns themselves. Since this isn't something we can really change in the
                       ;; query itself don't present the option to the users in the UI
                       (conj (sql/features this) :no-case-sensitivity-string-filter-options))})

  sql/ISQLDriver
  (let [{default-apply-order-by :apply-order-by, :as mixin} (sql/ISQLDriverDefaultsMixin)]
    (merge
     mixin
     {:apply-limit               (u/drop-first-arg apply-limit)
      :apply-page                (u/drop-first-arg apply-page)
      :apply-order-by            (partial apply-order-by default-apply-order-by)
      :column->base-type         (u/drop-first-arg column->base-type)
      :connection-details->spec  (u/drop-first-arg connection-details->spec)
      :current-datetime-fn       (constantly :%getutcdate)
      :date                      (u/drop-first-arg date)
      :excluded-schemas          (constantly #{"sys" "INFORMATION_SCHEMA"})
      :string-length-fn          (u/drop-first-arg string-length-fn)
      :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)})))

(defn -init-driver
  "Register the SQLServer driver"
  []
  (driver/register-driver! :sqlserver (SQLServerDriver.)))
