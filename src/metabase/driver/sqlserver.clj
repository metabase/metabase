(ns metabase.driver.sqlserver
  (:require [clojure.string :as s]
            (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as kutils]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.util.korma-extensions :as kx])
  (:import net.sourceforge.jtds.jdbc.Driver)) ; need to import this in order to load JDBC driver

(defn- column->base-type
  "See [this page](https://msdn.microsoft.com/en-us/library/ms187752.aspx) for details."
  [_ column-type]
  ({:bigint           :BigIntegerField
     :binary           :UnknownField
     :bit              :BooleanField ; actually this is 1 / 0 instead of true / false ...
     :char             :CharField
     :cursor           :UnknownField
     :date             :DateField
     :datetime         :DateTimeField
     :datetime2        :DateTimeField
     :datetimeoffset   :DateTimeField
     :decimal          :DecimalField
     :float            :FloatField
     :geography        :UnknownField
     :geometry         :UnknownField
     :hierarchyid      :UnknownField
     :image            :UnknownField
     :int              :IntegerField
     :money            :DecimalField
     :nchar            :CharField
     :ntext            :TextField
     :numeric          :DecimalField
     :nvarchar         :TextField
     :real             :FloatField
     :smalldatetime    :DateTimeField
     :smallint         :IntegerField
     :smallmoney       :DecimalField
     :sql_variant      :UnknownField
     :table            :UnknownField
     :text             :TextField
     :time             :TimeField
     :timestamp        :UnknownField ; not a standard SQL timestamp, see https://msdn.microsoft.com/en-us/library/ms182776.aspx
     :tinyint          :IntegerField
     :uniqueidentifier :UUIDField
     :varbinary        :UnknownField
     :varchar          :TextField
     :xml              :UnknownField
     (keyword "int identity") :IntegerField} column-type)) ; auto-incrementing integer (ie pk) field

(defn- connection-details->spec [_ {:keys [domain instance ssl], :as details}]
  (-> (kdb/mssql details)
      ;; swap out Microsoft Driver details for jTDS ones
      (assoc :classname   "net.sourceforge.jtds.jdbc.Driver"
             :subprotocol "jtds:sqlserver")

      ;; adjust the connection URL to match up with the jTDS format (see http://jtds.sourceforge.net/faq.html#urlFormat)
      (update :subname (fn [subname]
                         ;; jTDS uses a "/" instead of ";database="
                         (cond-> (s/replace subname #";database=" "/")
                           ;; and add the ;instance= option if applicable
                           (seq instance) (str ";instance=" instance)

                           ;; add Windows domain for Windows domain authentication if applicable. useNTLMv2 = send LMv2/NTLMv2 responses when using Windows auth
                           (seq domain) (str ";domain=" domain ";useNTLMv2=true")

                           ;; If SSL is specified append ;ssl=require, which enables SSL and throws exception if SSL connection cannot be made
                           ssl (str ";ssl=require"))))))

(defn- date-part [unit expr]
  (k/sqlfn :DATEPART (k/raw (name unit)) expr))

(defn- date-add [unit & exprs]
  (apply k/sqlfn* :DATEADD (k/raw (name unit)) exprs))

(defn- date
  "See also the [jTDS SQL <-> Java types table](http://jtds.sourceforge.net/typemap.html)"
  [_ unit expr]
  (case unit
    :default         (kx/->datetime expr)
    :minute          (kx/cast :SMALLDATETIME expr)
    :minute-of-hour  (date-part :minute expr)
    :hour            (kx/->datetime (kx/format "yyyy-MM-dd HH:00:00" expr))
    :hour-of-day     (date-part :hour expr)
    ;; jTDS is retarded; I sense an ongoing theme here. It returns DATEs as strings instead of as java.sql.Dates
    ;; like every other SQL DB we support. Work around that by casting to DATE for truncation then back to DATETIME so we get the type we want
    :day             (kx/->datetime (kx/->date expr))
    :day-of-week     (date-part :weekday expr)
    :day-of-month    (date-part :day expr)
    :day-of-year     (date-part :dayofyear expr)
    ;; Subtract the number of days needed to bring us to the first day of the week, then convert to date
    ;; The equivalent SQL looks like:
    ;;     CAST(DATEADD(day, 1 - DATEPART(weekday, %s), CAST(%s AS DATE)) AS DATETIME)
    :week            (kx/->datetime
                      (date-add :day
                                (kx/- 1 (date-part :weekday expr))
                                (kx/->date expr)))
    :week-of-year    (date-part :iso_week expr)
    :month           (kx/->datetime (kx/format "yyyy-MM-01" expr))
    :month-of-year   (date-part :month expr)
    ;; Format date as yyyy-01-01 then add the appropriate number of quarter
    ;; Equivalent SQL:
    ;;     DATEADD(quarter, DATEPART(quarter, %s) - 1, FORMAT(%s, 'yyyy-01-01'))
    :quarter         (date-add :quarter
                               (kx/dec (date-part :quarter expr))
                               (kx/format "yyyy-01-01" expr))
    :quarter-of-year (date-part :quarter expr)
    :year            (date-part :year expr)))

(defn- date-interval [_ unit amount]
  (date-add unit amount (k/sqlfn :GETUTCDATE)))

(defn- unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    ;; The second argument to DATEADD() gets casted to a 32-bit integer. BIGINT is 64 bites, so we tend to run into
    ;; integer overflow errors (especially for millisecond timestamps).
    ;; Work around this by converting the timestamps to minutes instead before calling DATEADD().
    :seconds      (date-add :minute (kx// expr 60) (kx/literal "1970-01-01"))
    :milliseconds (recur nil (kx// expr 1000) :seconds)))

(defn- apply-limit [_ korma-query {value :limit}]
  (k/modifier korma-query (format "TOP %d" value)))

(defn- apply-page [_ korma-query {{:keys [items page]} :page}]
  (k/offset korma-query (format "%d ROWS FETCH NEXT %d ROWS ONLY"
                                (* items (dec page))
                                items)))

(defrecord SQLServerDriver []
  clojure.lang.Named
  (getName [_] "SQL Server"))

(extend SQLServerDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:date-interval  date-interval
          :details-fields (constantly [{:name         "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      1433}
                                       {:name         "db"
                                        :display-name "Database name"
                                        :placeholder  "BirdsOfTheWorld"
                                        :required     true}
                                       {:name         "instance"
                                        :display-name "Database instance name"
                                        :placeholder  "N/A"}
                                       {:name         "domain"
                                        :display-name "Windows domain"
                                        :placeholder  "N/A"}
                                       {:name         "user"
                                        :display-name "Database username"
                                        :placeholder  "What username do you use to login to the database?"
                                        :required     true}
                                       {:name         "password"
                                        :display-name "Database password"
                                        :type         :password
                                        :placeholder  "*******"}
                                       {:name         "ssl"
                                        :display-name "Use a secure connection (SSL)?"
                                        :type         :boolean
                                        :default      false}])})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-limit               apply-limit
          :apply-page                apply-page
          :column->base-type         column->base-type
          :connection-details->spec  connection-details->spec
          :current-datetime-fn       (constantly (k/sqlfn* :GETUTCDATE))
          :date                      date
          :excluded-schemas          (constantly #{"sys" "INFORMATION_SCHEMA"})
          :stddev-fn                 (constantly :STDEV)
          :string-length-fn          (constantly :LEN)
          :unix-timestamp->timestamp unix-timestamp->timestamp}))

(driver/register-driver! :sqlserver (SQLServerDriver.))
